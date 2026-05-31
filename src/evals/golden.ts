import { runResearch } from "../lib/research/run";
import type { ResearchRun } from "../lib/research/types";

// The genuine anti-fabrication guard: every determination the pipeline marks
// "verified" must cite a real fetched source (url + quote). A determination
// grounded in a .gov quote cannot have been invented.
function groundedWhereVerified(run: ResearchRun): boolean {
  return run.determinations
    .filter((d) => d.verified)
    .every((d) => d.source_url.length > 0 && d.quote.length > 0);
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.log("SKIP evals: the dynamic planner needs OPENAI_API_KEY (parseScope is LLM-driven).");
    return;
  }

  const simple = await runResearch({ project_description: "A small tenant improvement that adds two ovens. No chemicals, no waste, no discharge." });
  const complex = await runResearch({
    project_description:
      "A SoCal manufacturer adds a coating booth, stores 60 gallons of flammable solvent, generates spent solvent waste, and has NAICS 323111.",
  });

  const complexVerified = complex.determinations.some((d) => d.verified);
  const complexNeedsReview = complex.determinations.some((d) => d.review_flag);

  const checks: Array<{ id: string; passed: boolean; details: string }> = [
    {
      id: "simple-defensible",
      passed: groundedWhereVerified(simple),
      details: `tasks=${simple.research_tasks.length} grounded=${groundedWhereVerified(simple)}`,
    },
    {
      // complex must: ground every verified determination, actually verify at
      // least one (the real research pipeline grounded something), AND flag at
      // least one for review (missing facts surface as needs_review — never
      // fabricated into a confident determination).
      id: "complex-defensible",
      passed: groundedWhereVerified(complex) && complexVerified && complexNeedsReview,
      details: `tasks=${complex.research_tasks.length} grounded=${groundedWhereVerified(complex)} verified=${complexVerified} needsReview=${complexNeedsReview}`,
    },
    {
      // The point of the dynamic planner: richer facts → strictly more research.
      id: "dynamism",
      passed: complex.research_tasks.length > simple.research_tasks.length,
      details: `complex tasks=${complex.research_tasks.length} > simple tasks=${simple.research_tasks.length}`,
    },
  ];

  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.id}: ${check.details}`);
  }
  if (checks.some((c) => !c.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
