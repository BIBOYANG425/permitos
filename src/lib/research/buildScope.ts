import type { ResearchRunInput, ScopePack } from "./types";
import type { SdsReview } from "@/lib/sds/types";
import { applySdsHandoffToScope, createRunId, parseScope } from "./scope";
import { reviewSdsInputs } from "@/lib/sds/reviewer";

export type BuiltScope = { scope: ScopePack; sds_reviews: SdsReview[] };

// Node-side intake/scope-extraction (kept). Mints the run_id, reviews any SDS docs,
// extracts the ScopePack from the project description, and folds confirmed SDS handoff
// facts into the scope so the family those facts flag is reviewed. It does NOT plan —
// the Python orchestrate tier owns planning. The run_id is carried on the scope so the
// Python pipeline reuses it (plan_candidates reads scope.run_id), threading one id end
// to end.
export async function buildScope(input: ResearchRunInput): Promise<BuiltScope> {
  const run_id = createRunId();
  const sds_reviews = reviewSdsInputs(input.demo_documents ?? [], run_id, { asOfDate: new Date() });
  const base = await parseScope(input, run_id);
  const scope = applySdsHandoffToScope(base, sds_reviews);
  return { scope, sds_reviews };
}
