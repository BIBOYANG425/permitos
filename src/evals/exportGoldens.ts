// src/evals/exportGoldens.ts
// Dumps the deterministic pipeline artifacts for the three seeded scopes as
// committed parity goldens. Run with RESEARCH_MODE=fixture for deterministic evidence.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planResearch } from "@/lib/research/planner";
import { runLocalResearchPool } from "@/lib/research/workers";
import { finalizeRun } from "@/lib/research/run";
import {
  seededComplexScope,
  seededConstructionScope,
  seededMissingFactsScope,
} from "@/lib/research/fixtures/scenarios";
import type { ScopePack } from "@/lib/research/types";

process.env.RESEARCH_MODE = "fixture"; // deterministic cached evidence + canned repair

const OUT_DIR = join(process.cwd(), "research_core", "tests", "goldens");

async function buildGolden(runId: string, scope_pack: ScopePack) {
  const plan = planResearch(scope_pack, new Set()); // empty set = no SDS-active families
  const pool = await runLocalResearchPool(plan.research_tasks, plan.research_graph);
  const result = await finalizeRun(runId, scope_pack, plan, pool.bundles, [], []);
  // Parity-relevant, fully-deterministic subset (trace_events excluded: timestamps).
  return {
    run_id: runId,
    scope_pack,
    fixture_evidence: pool.bundles,
    plan: {
      coverage_family_statuses: plan.coverage_family_statuses,
      regulatory_angles: plan.regulatory_angles,
      research_graph: plan.research_graph,
      research_tasks: plan.research_tasks,
    },
    verification_verdicts: result.verification_verdicts,
    evidence_bundles: result.evidence_bundles, // latest (incl. repaired)
    determinations: result.determinations,
    status: result.status,
    report_markdown: result.report_markdown, // structural-parity only
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const cases: Array<[string, string, ScopePack]> = [
    ["complex", "golden-complex", seededComplexScope("golden-complex", "")],
    ["construction", "golden-construction", seededConstructionScope("golden-construction", "")],
    ["missing_facts", "golden-missing", seededMissingFactsScope("golden-missing", "")],
  ];
  for (const [file, runId, scope] of cases) {
    const golden = await buildGolden(runId, scope);
    writeFileSync(join(OUT_DIR, `${file}.json`), JSON.stringify(golden, null, 2) + "\n");
    console.log(`wrote ${file}.json (${golden.determinations.length} determinations, status=${golden.status})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
