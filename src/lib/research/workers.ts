import type { EvidenceBundle, ResearchHypothesis, ResearchTask } from "./types";
import { sourceFixtures } from "./fixtures/sources";
import type { ResearchPoolResult } from "./modal/researchPool";
import { getResearchMode } from "./researchMode";

// Routes a research run to the configured executor (see researchMode.ts):
//   live    -> in-process agentic LLM researcher (liveWorker.ts)
//   modal   -> deployed Modal worker pool (modal/researchPool.ts)
//   fixture -> deterministic cached evidence (runFixturePool, demo/offline only)
// live/modal both fall back to fixtures (with a degraded flag) if their executor is
// unreachable, so a run always renders — honestly labeled when it is not live.
export async function runLocalResearchPool(
  tasks: ResearchTask[],
  hypotheses: ResearchHypothesis[]
): Promise<ResearchPoolResult> {
  const mode = getResearchMode();

  if (mode === "modal") {
    const { runModalResearchPool } = await import("./modal/researchPool");
    const result = await runModalResearchPool(tasks, hypotheses);
    if (result.degraded) {
      return { bundles: runFixturePool(tasks, hypotheses), degraded: result.degraded };
    }
    return { bundles: result.bundles };
  }

  if (mode === "live") {
    const { runLiveResearchPool } = await import("./liveWorker");
    const result = await runLiveResearchPool(tasks, hypotheses);
    if (result.degraded) {
      return { bundles: runFixturePool(tasks, hypotheses), degraded: result.degraded };
    }
    return { bundles: result.bundles };
  }

  return { bundles: runFixturePool(tasks, hypotheses) };
}

function runFixturePool(tasks: ResearchTask[], hypotheses: ResearchHypothesis[]): EvidenceBundle[] {
  const byId = new Map(hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));
  return tasks.map((task) => {
    const hypothesis = byId.get(task.hypothesis_id);
    if (!hypothesis) {
      return failedBundle(task.hypothesis_id, `Missing hypothesis for task ${task.task_id}`);
    }
    return runResearchTask(task, hypothesis);
  });
}

function runResearchTask(task: ResearchTask, hypothesis: ResearchHypothesis): EvidenceBundle {
  const fixtureId = fixtureForHypothesis(hypothesis.id);
  const fixture = sourceFixtures[fixtureId];

  if (!fixture) {
    return failedBundle(task.hypothesis_id, `No source fixture found for ${hypothesis.id}`);
  }

  return {
    hypothesis_id: hypothesis.id,
    sources: [
      {
        url: fixture.url,
        source_name: fixture.source_name,
        authority_rank: fixture.authority_rank,
        fetched_at: fixture.fetched_at,
        content_hash: fixture.content_hash,
        effective_date: fixture.effective_date,
        quote: fixture.quote
      }
    ],
    extracted_claims: [
      {
        field: Object.keys(fixture.extracted)[0] ?? "source_claim",
        value: String(Object.values(fixture.extracted)[0] ?? hypothesis.claim_to_test ?? hypothesis.question),
        source_url: fixture.url,
        quote: fixture.quote,
        confidence: 0.82
      }
    ],
    researcher_conclusion: preliminaryConclusion(hypothesis.id),
    uncertainties: hypothesis.id === "H-WASTE-GENERATOR" ? ["Monthly hazardous waste quantity is missing."] : [],
    permit_filing: fixture.permit_filing
  };
}

function fixtureForHypothesis(hypothesisId: string) {
  const map: Record<string, string> = {
    "H-AIR-201": "scaqmd_rule_201",
    "H-AIR-VOC": "scaqmd_rule_201",
    "H-AIR-219": "scaqmd_rule_219",
    "H-AIR-222": "scaqmd_rule_222",
    "H-STORM-IGP": "industrial_general_permit",
    "H-STORM-CGP": "construction_general_permit",
    "H-HAZMAT-HMBP": "hmbp_threshold_bad",
    "H-WASTE-GENERATOR": "hazardous_waste_generator",
    "H-WASTEWATER-PRETREATMENT": "wastewater_pretreatment"
  };
  return map[hypothesisId] ?? "";
}

function preliminaryConclusion(hypothesisId: string): EvidenceBundle["researcher_conclusion"] {
  if (hypothesisId === "H-WASTE-GENERATOR" || hypothesisId === "H-WASTEWATER-PRETREATMENT") {
    return "needs_review";
  }
  return "applies";
}

function failedBundle(hypothesis_id: string, reason: string): EvidenceBundle {
  return {
    hypothesis_id,
    sources: [],
    extracted_claims: [],
    researcher_conclusion: "needs_review",
    uncertainties: [reason]
  };
}
