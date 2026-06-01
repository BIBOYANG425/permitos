// Standing orchestration tier (the second system-prompted agent, after intake).
//
// runOrchestrationBriefing is a real LLM reasoning pass over the decomposition: given
// the scope and the planned coverage families / angles / hypotheses, it produces a short
// brief recorded in the run trace. It is fail-soft and ADDITIVE — it never changes
// determinations or overrides the mechanical verifier / recall floor; it makes the
// orchestrator's reasoning visible. Skipped without an API key. The llmFn is injectable
// so the wiring is unit-testable without a network call.
import OpenAI from "openai";
import { ORCHESTRATION_SYSTEM_PROMPT } from "./prompts";
import type { CoverageFamilyStatus, RegulatoryAngle, ResearchHypothesis, ScopePack } from "./types";

export type OrchestrationBriefInput = {
  scope: ScopePack;
  coverage_family_statuses: CoverageFamilyStatus[];
  regulatory_angles: RegulatoryAngle[];
  research_graph: ResearchHypothesis[];
};

export type OrchestrationLlmFn = (system: string, user: string) => Promise<string | null>;

function summarizePlan(input: OrchestrationBriefInput): string {
  const families = input.coverage_family_statuses.map((s) => `${s.family}:${s.status}`).join(", ");
  const hypotheses = input.research_graph.map((h) => `${h.id} (${h.family})`).join("; ");
  const chemicals =
    input.scope.project_change.chemicals.map((c) => `${c.name} ${c.quantity ?? "?"}${c.unit ?? ""}`).join(", ") || "none";
  const equipment = input.scope.project_change.equipment.map((e) => e.kind).join(", ") || "none";
  return [
    `Facility jurisdiction: ${input.scope.facility.jurisdiction_stack.join(" > ") || "unspecified"}.`,
    `Project: ${input.scope.project_change.description}`,
    `Equipment: ${equipment}. Chemicals: ${chemicals}.`,
    `Coverage families: ${families || "none active"}.`,
    `Planned hypotheses: ${hypotheses || "none"}.`,
    "In 2-3 sentences, state which families you are prioritizing and why, and flag any breadth risk " +
      "(a family that may be under- or over-covered). Do not assert applicability — that is decided by " +
      "grounded research and the mechanical verifier.",
  ].join("\n");
}

const openAiBriefing: OrchestrationLlmFn = async (system, user) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_ORCHESTRATION_MODEL ?? process.env.OPENAI_INTAKE_MODEL ?? "gpt-4o-mini",
      max_completion_tokens: 400,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return completion.choices[0]?.message?.content ?? null;
  } catch {
    return null;
  }
};

export async function runOrchestrationBriefing(
  input: OrchestrationBriefInput,
  llmFn: OrchestrationLlmFn = openAiBriefing,
): Promise<string | null> {
  const brief = await llmFn(ORCHESTRATION_SYSTEM_PROMPT, summarizePlan(input));
  return brief && brief.trim() ? brief.trim() : null;
}
