// In-process live research pool: supplies the real OpenAI / HTTP / PDF / skill-file
// I/O to the catalog-governed agent in liveResearchAgent.ts. This is the production
// default research path (RESEARCH_MODE=live) — a real tool-using model loop that
// fetches allowlisted primary sources and grounds every claim, with no Modal.
//
// Dynamically imported by workers.ts only in live mode, so its openai/pdfjs imports
// never load in fixture-mode tests.
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { EvidenceBundle, ResearchHypothesis, ResearchTask } from "./types";
import type { ResearchPoolResult } from "./modal/researchPool";
import {
  EXTRACT_SYSTEM,
  failedBundle,
  runResearchAgent,
  type AgentMessage,
  type ExtractFn,
  type ExtractionHint,
  type ExtractResult,
  type FetchFn,
  type LlmFn,
  type ReadSkillFn,
  type ToolSchema,
} from "./liveResearchAgent";

const MAX_BYTES = 5_000_000;
const MAX_TEXT_CHARS = 24_000;
const HTTP_TIMEOUT_MS = 20_000;
const SKILL_ID_RE = /^[a-z0-9-]+$/;

function researchModel(): string {
  return process.env.OPENAI_RESEARCH_MODEL ?? "gpt-4o-mini";
}

// --- Model loop ------------------------------------------------------------

function toOpenAiMessages(messages: AgentMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m): ChatCompletionMessageParam => {
    if (m.role === "assistant") {
      if (m.tool_calls.length > 0) {
        return {
          role: "assistant",
          content: m.content ?? "",
          tool_calls: m.tool_calls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) },
          })),
        };
      }
      return { role: "assistant", content: m.content ?? "" };
    }
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

function makeLlmFn(client: OpenAI): LlmFn {
  return async (messages, tools) => {
    const params: Parameters<typeof client.chat.completions.create>[0] = {
      model: researchModel(),
      messages: toOpenAiMessages(messages),
      max_completion_tokens: 4000,
    };
    if (tools.length > 0) {
      params.tools = tools as unknown as ChatCompletionTool[];
    }
    const completion = await client.chat.completions.create(params);
    const msg = "choices" in completion ? completion.choices[0]?.message : undefined;
    const tool_calls = (msg?.tool_calls ?? []).flatMap((tc) => {
      if (tc.type !== "function") return [];
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }
      return [{ id: tc.id, name: tc.function.name, arguments: args }];
    });
    return { content: msg?.content ?? null, tool_calls };
  };
}

// --- Grounded structured extraction (deterministic fallback) ---------------

function makeExtractFn(client: OpenAI): ExtractFn {
  return async (text, question, hint: ExtractionHint): Promise<ExtractResult> => {
    const tool: ChatCompletionTool = {
      type: "function",
      function: {
        name: "extract_finding",
        description: "Return the grounded finding.",
        parameters: {
          type: "object",
          properties: {
            field: { type: "string", enum: [hint.field] },
            threshold_value: { type: ["number", "null"] },
            verbatim_quote: { type: "string" },
            applies: { type: "string", enum: ["applies", "does_not_apply", "needs_review"] },
            confidence: { type: "number" },
          },
          required: ["field", "verbatim_quote", "applies", "confidence"],
        },
      },
    };
    const completion = await client.chat.completions.create({
      model: researchModel(),
      max_completion_tokens: 2000,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user", content: `Research question: ${question}\nExtract ${hint.ask}.\n\nSOURCE TEXT:\n${text}` },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "extract_finding" } },
    });
    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== "function") {
      return { field: hint.field, verbatim_quote: "", applies: "needs_review", confidence: 0.3 };
    }
    try {
      return JSON.parse(call.function.arguments || "{}") as ExtractResult;
    } catch {
      return { field: hint.field, verbatim_quote: "", applies: "needs_review", confidence: 0.3 };
    }
  };
}

// --- Allowlisted fetch + extraction ----------------------------------------

async function extractPdfText(data: Uint8Array): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.mjs",
        import.meta.url,
      ).toString();
    }
    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => (typeof item === "object" && item && "str" in item ? String((item as { str: unknown }).str) : ""))
          .join(" "),
      );
    }
    await (pdf as { destroy?: () => Promise<unknown> }).destroy?.().catch(() => {});
    return pages.join("\n").trim();
  } catch {
    return "";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const fetchSource: FetchFn = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "PermitPilot/0.1 (research)" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!resp.ok) {
      return { content_hash: "", text: "" };
    }
    const ctype = (resp.headers.get("content-type") ?? "").toLowerCase();
    const buf = new Uint8Array(await resp.arrayBuffer());
    const data = buf.length > MAX_BYTES ? buf.subarray(0, MAX_BYTES) : buf;
    const content_hash = "sha256:" + createHash("sha256").update(data).digest("hex");
    const isPdf = ctype.includes("pdf") || url.toLowerCase().endsWith(".pdf");
    const text = isPdf ? await extractPdfText(data) : stripHtml(new TextDecoder().decode(data));
    return { content_hash, text: text.slice(0, MAX_TEXT_CHARS) };
  } finally {
    clearTimeout(timer);
  }
};

// --- Skill-file reader -----------------------------------------------------

function skillsDir(): string {
  return process.env.SKILLS_DIR ?? path.join(process.cwd(), "src", "lib", "research", "skills");
}

const readSkillFile: ReadSkillFn = async (skillId) => {
  if (!skillId || !SKILL_ID_RE.test(skillId)) return "";
  try {
    return await readFile(path.join(skillsDir(), skillId, "SKILL.md"), "utf-8");
  } catch {
    return "";
  }
};

// --- Pool ------------------------------------------------------------------

export async function runLiveResearchPool(
  tasks: ResearchTask[],
  hypotheses: ResearchHypothesis[],
): Promise<ResearchPoolResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { bundles: [], degraded: { reason: "OPENAI_API_KEY not set for live research" } };
  }
  const client = new OpenAI({ apiKey });
  const llmFn = makeLlmFn(client);
  const extractFn = makeExtractFn(client);
  const nowIso = new Date().toISOString();
  const byId = new Map(hypotheses.map((h) => [h.id, h]));

  const bundles: EvidenceBundle[] = await Promise.all(
    tasks.map(async (task) => {
      const hypothesis = byId.get(task.hypothesis_id);
      if (!hypothesis) {
        return failedBundle(task.hypothesis_id, `Missing hypothesis for ${task.task_id}`);
      }
      const question = task.repair_instruction
        ? `${hypothesis.question}\n\nREPAIR INSTRUCTION: ${task.repair_instruction}`
        : hypothesis.question;
      try {
        return await runResearchAgent(task, question, {
          llmFn,
          fetchFn: fetchSource,
          extractFn,
          readSkillFn: readSkillFile,
          nowIso,
        });
      } catch (err) {
        return failedBundle(task.hypothesis_id, `Live agent failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }),
  );
  return { bundles };
}
