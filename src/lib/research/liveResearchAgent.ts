// Catalog-governed in-process research agent (pure, dependency-injected).
//
// This is the TypeScript peer of modal/worker_core.run_research_agent: the same
// agentic loop and guardrails, runnable inside the Node server with no Modal.
// All I/O (model call, fetch, extract, skill read) is injected so the loop is
// unit-testable with fakes; liveWorker.ts supplies the real OpenAI/HTTP impls.
//
// Design contract (see feedback-agent-context-engineering memory): the researcher
// is NOT given a per-role persona. It is steered by the research-skill task frame,
// just-in-time curated context (its hypothesis + registry-resolved pointer/hint/
// skill + allowed tools), and the EvidenceBundle output schema it must satisfy.
import type { EvidenceBundle, ResearchTask } from "./types";
import {
  extractionHintForHypothesis,
  skillIdForHypothesis,
  sourcePointerForHypothesis,
  type SourcePointer,
} from "./programRegistry";
import { isAllowlistedUrl } from "./sourceAllowlist";

export type ExtractionHint = { field: string; ask: string };

export type ExtractResult = {
  field?: string;
  threshold_value?: number | null;
  verbatim_quote?: string;
  applies?: string;
  confidence?: number;
  effective_date?: string | null;
};

export type AgentToolCall = { id: string; name: string; arguments: Record<string, unknown> };

export type AgentMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: AgentToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

export type ToolSchema = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type LlmFn = (
  messages: AgentMessage[],
  tools: ToolSchema[],
) => Promise<{ content: string | null; tool_calls: AgentToolCall[] }>;
export type FetchFn = (url: string) => Promise<{ content_hash: string; text: string }>;
export type ExtractFn = (text: string, question: string, hint: ExtractionHint) => Promise<ExtractResult>;
export type ReadSkillFn = (skillId: string) => Promise<string>;

// System frame for the deterministic structured-extraction fallback (mirrors
// modal/worker.py EXTRACT_SYSTEM). Grounding-only; not a researcher persona.
export const EXTRACT_SYSTEM =
  "You are an EHS regulatory research assistant. Extract ONLY what the text actually " +
  "says. The verbatim_quote MUST be copied exactly from the source text. If the text " +
  "does not support a finding, set applies to needs_review and leave verbatim_quote empty.";

// The research-skill task frame (mirrors skillRegistry `research` done-condition and
// modal/worker_core RESEARCH_SKILL_PROMPT). Thin and task-scoped — not a persona.
export const RESEARCH_TASK_INSTRUCTION =
  "You are running the research skill on ONE permit hypothesis. First call read_skill to " +
  "orient on the relevant EHS triggers, thresholds, exemptions, and which primary source to " +
  "fetch — orientation only, NEVER citable evidence. Then load the official source pointer, " +
  "fetch the allowlisted source, prove currency, and call extract_threshold with the grounded " +
  "finding. The verbatim_quote MUST be copied exactly from the fetched source text. If you " +
  "cannot ground a finding, call extract_threshold with applies=needs_review and an empty " +
  "verbatim_quote. You may only use the tools you are given.";

// OpenAI function schemas for the researcher tools we actually implement, keyed by
// catalog tool id. Tools outside this map are never exposed and are hard-refused.
export const TOOL_SCHEMAS: Record<string, ToolSchema> = {
  read_skill: {
    type: "function",
    function: {
      name: "read_skill",
      description:
        "Read the EHS domain skill for this hypothesis (triggers, threshold ranges, exemptions, and which primary source to fetch). Orientation only — never cite the skill as evidence; you must still fetch and quote the primary source.",
      parameters: { type: "object", properties: { skill_id: { type: "string" } } },
    },
  },
  get_source_pointers: {
    type: "function",
    function: {
      name: "get_source_pointers",
      description: "Return the allowlisted official source URL and authority rank for this hypothesis.",
      parameters: { type: "object", properties: {} },
    },
  },
  get_triggers: {
    type: "function",
    function: {
      name: "get_triggers",
      description: "Return the threshold/predicate extraction hint for this hypothesis.",
      parameters: { type: "object", properties: {} },
    },
  },
  fetch_source: {
    type: "function",
    function: {
      name: "fetch_source",
      description: "Fetch an allowlisted source URL and return its content hash and extracted text.",
      parameters: { type: "object", properties: { url: { type: "string" } } },
    },
  },
  prove_currency: {
    type: "function",
    function: {
      name: "prove_currency",
      description: "Classify the fetched source as current, stale, or unconfirmed.",
      parameters: { type: "object", properties: {} },
    },
  },
  evaluate_predicate: {
    type: "function",
    function: {
      name: "evaluate_predicate",
      description: "Record evaluation of the trigger predicate against project attributes.",
      parameters: { type: "object", properties: { note: { type: "string" } } },
    },
  },
  extract_threshold: {
    type: "function",
    function: {
      name: "extract_threshold",
      description: "Submit the grounded finding. Terminal — ends the investigation.",
      parameters: {
        type: "object",
        properties: {
          field: { type: "string" },
          threshold_value: { type: ["number", "null"] },
          triggering_clause: { type: "string" },
          verbatim_quote: { type: "string" },
          applies: { type: "string", enum: ["applies", "does_not_apply", "needs_review"] },
          confidence: { type: "number" },
        },
        required: ["field", "verbatim_quote", "applies", "confidence"],
      },
    },
  },
};

// Researcher tools allowed by scope but never offered as model tools (the cache is
// empty in-process; injection quarantine is enforced inside fetch).
const NON_CALLABLE = new Set(["get_cached_source", "quarantine_injection"]);

function normWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function intOr(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function failedBundle(hypothesisId: string, reason: string): EvidenceBundle {
  return {
    hypothesis_id: hypothesisId,
    sources: [],
    extracted_claims: [],
    researcher_conclusion: "needs_review",
    uncertainties: [reason],
  };
}

// Pure mapping: extraction result + fetch metadata -> EvidenceBundle. Falls back to
// needs_review when no verbatim quote was grounded.
export function assembleEvidence(
  hypothesisId: string,
  pointer: SourcePointer,
  contentHash: string,
  fetchedAt: string,
  extract: ExtractResult,
): EvidenceBundle {
  const quote = (extract.verbatim_quote ?? "").trim();
  if (!quote) {
    return failedBundle(hypothesisId, "No supporting verbatim quote found in the fetched source.");
  }
  const field = extract.field || "source_claim";
  const value = extract.threshold_value;
  const applies = extract.applies ?? "needs_review";
  const confidence = Number.isFinite(Number(extract.confidence)) ? Number(extract.confidence) : 0.5;
  const conclusion =
    applies === "applies" || applies === "does_not_apply" || applies === "needs_review"
      ? (applies as EvidenceBundle["researcher_conclusion"])
      : "needs_review";
  return {
    hypothesis_id: hypothesisId,
    sources: [
      {
        url: pointer.url,
        source_name: pointer.source_name,
        authority_rank: pointer.authority_rank,
        fetched_at: fetchedAt,
        content_hash: contentHash,
        effective_date: extract.effective_date ?? null,
        quote,
      },
    ],
    extracted_claims: [
      {
        field,
        value: value === null || value === undefined ? "" : String(value),
        source_url: pointer.url,
        quote,
        confidence,
      },
    ],
    researcher_conclusion: conclusion,
    uncertainties: [],
  };
}

export function exposedToolSchemas(allowedTools: string[]): ToolSchema[] {
  return allowedTools.filter((t) => t in TOOL_SCHEMAS).map((t) => TOOL_SCHEMAS[t]);
}

// The catalog-governed loop. Returns a grounded EvidenceBundle or an honest
// needs_review/failed bundle — it never throws out to the caller.
export async function runResearchAgent(
  task: ResearchTask,
  question: string,
  deps: { llmFn: LlmFn; fetchFn: FetchFn; extractFn: ExtractFn; readSkillFn: ReadSkillFn; nowIso: string },
): Promise<EvidenceBundle> {
  const hid = task.hypothesis_id;
  const pointer = sourcePointerForHypothesis(hid);
  if (!pointer) {
    return failedBundle(hid, `No source pointer for ${hid}`);
  }
  const hint = extractionHintForHypothesis(hid) ?? { field: "source_claim", ask: "the clause that determines whether this requirement applies" };
  const allowed = new Set<string>(task.allowed_tools as unknown as string[]);
  const blocked = new Set<string>(task.blocked_tools as unknown as string[]);
  const maxCalls = intOr(task.budget?.max_model_calls, 4);
  const maxSources = intOr(task.budget?.max_sources, 3);
  const tools = exposedToolSchemas([...allowed]);

  const messages: AgentMessage[] = [
    { role: "system", content: RESEARCH_TASK_INSTRUCTION },
    { role: "user", content: `Hypothesis ${hid}. Question: ${question}` },
  ];

  let fetchedText = "";
  let contentHash = "";
  let sourcesUsed = 0;

  for (let i = 0; i < maxCalls; i++) {
    const resp = await deps.llmFn(messages, tools);
    const calls = resp.tool_calls ?? [];
    messages.push({ role: "assistant", content: resp.content, tool_calls: calls });
    if (calls.length === 0) break;

    let terminal: EvidenceBundle | null = null;
    for (const call of calls) {
      const name = call.name ?? "";
      const args = call.arguments ?? {};
      const callId = call.id ?? "";

      if (blocked.has(name) || !allowed.has(name) || NON_CALLABLE.has(name)) {
        messages.push({ role: "tool", tool_call_id: callId, name, content: JSON.stringify({ error: `tool '${name}' is not permitted for this skill` }) });
        continue;
      }

      if (name === "extract_threshold") {
        const extract: ExtractResult = { ...(args as ExtractResult) };
        const quote = (extract.verbatim_quote ?? "").trim();
        const grounded = !!quote && normWs(fetchedText).includes(normWs(quote));
        if (quote && !grounded) {
          extract.verbatim_quote = "";
          extract.applies = "needs_review";
        }
        if (!extract.field) extract.field = hint.field;
        terminal = assembleEvidence(hid, pointer, contentHash, deps.nowIso, extract);
        break;
      }

      let payload: Record<string, unknown>;
      if (name === "get_source_pointers") {
        payload = { url: pointer.url, source_name: pointer.source_name, authority_rank: pointer.authority_rank };
      } else if (name === "get_triggers") {
        payload = { field: hint.field, ask: hint.ask };
      } else if (name === "read_skill") {
        const requested = (typeof args.skill_id === "string" && args.skill_id.trim()) || skillIdForHypothesis(hid) || "";
        if (!requested) {
          payload = { error: `no skill mapped for ${hid}` };
        } else {
          let content = "";
          try {
            content = await deps.readSkillFn(requested);
          } catch {
            content = "";
          }
          payload = content ? { skill_id: requested, content } : { error: `skill '${requested}' not found` };
        }
      } else if (name === "fetch_source") {
        if (sourcesUsed >= maxSources) {
          payload = { error: "max_sources budget exceeded" };
        } else {
          const url = (typeof args.url === "string" && args.url.trim()) || pointer.url;
          if (!isAllowlistedUrl(url)) {
            payload = { error: `host not allowlisted: ${url}` };
          } else {
            const fetched = await deps.fetchFn(url);
            contentHash = fetched.content_hash;
            fetchedText = fetched.text;
            sourcesUsed += 1;
            payload = { content_hash: contentHash, text: fetchedText };
          }
        }
      } else if (name === "prove_currency") {
        payload = fetchedText
          ? { status: "unconfirmed", detail: "no effective date parsed; currency not independently verified" }
          : { status: "no_source", detail: "fetch a source first" };
      } else if (name === "evaluate_predicate") {
        payload = { note: typeof args.note === "string" ? args.note : "predicate recorded" };
      } else {
        payload = { error: `unknown tool '${name}'` };
      }
      messages.push({ role: "tool", tool_call_id: callId, name, content: JSON.stringify(payload) });
    }
    if (terminal) return terminal;
  }

  // Budget exhausted without a grounded submit -> deterministic fetch+extract fallback.
  if (!fetchedText) {
    try {
      const fetched = await deps.fetchFn(pointer.url);
      contentHash = fetched.content_hash;
      fetchedText = fetched.text;
    } catch (err) {
      return failedBundle(hid, `Fallback fetch failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }
  const extract = await deps.extractFn(fetchedText, question, hint);
  const quote = (extract.verbatim_quote ?? "").trim();
  if (quote && !normWs(fetchedText).includes(normWs(quote))) {
    extract.verbatim_quote = "";
    extract.applies = "needs_review";
  }
  return assembleEvidence(hid, pointer, contentHash, deps.nowIso, extract);
}
