import { describe, it, expect } from "vitest";
import {
  runResearchAgent,
  type AgentMessage,
  type ExtractResult,
  type LlmFn,
} from "../liveResearchAgent";
import { researchWorkerToolIds, blockedToolIdsForRole } from "../toolCatalog";
import type { ResearchTask } from "../types";

function task(hypothesisId: string, overrides: Partial<ResearchTask["budget"]> = {}): ResearchTask {
  return {
    task_id: `T-${hypothesisId.slice(2)}`,
    hypothesis_id: hypothesisId,
    assigned_agent: "air_researcher",
    allowed_tools: researchWorkerToolIds(),
    blocked_tools: blockedToolIdsForRole("researcher"),
    budget: { max_sources: 3, max_runtime_seconds: 30, max_model_calls: 4, ...overrides },
  };
}

// Real allowlisted SCAQMD Rule 201 text the fake fetch returns; the grounded quote
// below is a verbatim substring of it.
const RULE_201_TEXT =
  "A person shall not build, erect, install or alter any equipment that may emit air " +
  "contaminants without first obtaining written authorization in the form of a Permit to Construct.";
const GROUNDED_QUOTE = "without first obtaining written authorization in the form of a Permit to Construct";

const deps = (llmFn: LlmFn, extract?: ExtractResult) => ({
  llmFn,
  fetchFn: async () => ({ content_hash: "sha256:test", text: RULE_201_TEXT }),
  extractFn: async (): Promise<ExtractResult> =>
    extract ?? { field: "permit_trigger", verbatim_quote: GROUNDED_QUOTE, applies: "applies", confidence: 0.9 },
  readSkillFn: async (id: string) => `# Skill ${id}\nOrientation: fetch Rule 201 and quote it.`,
  nowIso: "2026-06-01T00:00:00.000Z",
});

// A scripted model: emits the given tool call on each turn, in order.
function scriptedLlm(turns: Array<{ name: string; arguments?: Record<string, unknown> }>): LlmFn {
  let i = 0;
  return async (_messages: AgentMessage[]) => {
    const turn = turns[i++];
    if (!turn) return { content: null, tool_calls: [] };
    return { content: null, tool_calls: [{ id: `c${i}`, name: turn.name, arguments: turn.arguments ?? {} }] };
  };
}

describe("runResearchAgent (in-process live agent)", () => {
  it("orients on the skill, fetches an allowlisted source, and grounds the finding", async () => {
    const llm = scriptedLlm([
      { name: "read_skill", arguments: {} },
      { name: "fetch_source", arguments: { url: "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf" } },
      { name: "prove_currency", arguments: {} },
      { name: "extract_threshold", arguments: { field: "permit_trigger", verbatim_quote: GROUNDED_QUOTE, applies: "applies", confidence: 0.88 } },
    ]);
    const bundle = await runResearchAgent(task("H-AIR-201"), "Does new equipment need a Permit to Construct?", deps(llm));

    expect(bundle.hypothesis_id).toBe("H-AIR-201");
    expect(bundle.sources).toHaveLength(1);
    expect(bundle.sources[0].source_name).toMatch(/Rule 201|Permit to Construct/i);
    expect(bundle.sources[0].quote).toBe(GROUNDED_QUOTE);
    expect(bundle.sources[0].content_hash).toBe("sha256:test");
    expect(bundle.extracted_claims[0].field).toBe("permit_trigger");
    expect(bundle.researcher_conclusion).toBe("applies");
  });

  it("blanks an ungrounded quote and returns needs_review (grounding guard)", async () => {
    const llm = scriptedLlm([
      { name: "fetch_source", arguments: {} },
      { name: "extract_threshold", arguments: { field: "permit_trigger", verbatim_quote: "a quote that is not in the source text", applies: "applies", confidence: 0.95 } },
    ]);
    const bundle = await runResearchAgent(task("H-AIR-201"), "q", deps(llm));

    expect(bundle.researcher_conclusion).toBe("needs_review");
    expect(bundle.sources).toHaveLength(0); // no grounded quote -> failed bundle
  });

  it("refuses a blocked tool but keeps going, then grounds via the deterministic fallback", async () => {
    // Model wastes turns on a blocked tool (get_form) and never submits; budget
    // exhausts and the deterministic fetch+extract fallback produces the bundle.
    const llm = scriptedLlm([
      { name: "get_form", arguments: {} },
      { name: "get_form", arguments: {} },
      { name: "get_form", arguments: {} },
      { name: "get_form", arguments: {} },
    ]);
    const bundle = await runResearchAgent(task("H-AIR-201"), "q", deps(llm));

    // Fallback extractFn returns a grounded quote -> applies.
    expect(bundle.sources).toHaveLength(1);
    expect(bundle.sources[0].quote).toBe(GROUNDED_QUOTE);
    expect(bundle.researcher_conclusion).toBe("applies");
  });

  it("fails closed when the hypothesis has no registry source pointer", async () => {
    const llm = scriptedLlm([]);
    const bundle = await runResearchAgent(task("H-DOES-NOT-EXIST"), "q", deps(llm));
    expect(bundle.researcher_conclusion).toBe("needs_review");
    expect(bundle.uncertainties[0]).toMatch(/no source pointer/i);
  });
});
