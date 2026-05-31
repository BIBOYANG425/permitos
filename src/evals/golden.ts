import { runResearch } from "../lib/research/run";

type EvalResult = {
  id: string;
  passed: boolean;
  details: string;
};

const cases = [
  {
    id: "simple-construction",
    description: "Simple construction project disturbing 1.2 acres in Southern California.",
    assert: async () => {
      const run = await runResearch({ project_description: "Simple construction project disturbing 1.2 acres." });
      const row = run.determinations.find((item) => item.requirement === "Construction stormwater permit coverage");
      return {
        passed: row?.applies === "yes" && row.verified === true,
        details: `construction row applies=${row?.applies} verified=${row?.verified}`
      };
    }
  },
  {
    id: "complex-facility",
    description: "SoCal manufacturer adds coating booth, hazardous liquid, spent solvent, and industrial activity.",
    assert: async () => {
      const run = await runResearch({
        project_description:
          "A SoCal manufacturer is adding a coating booth and storing 60 gallons of flammable solvent with spent solvent waste."
      });
      const enoughTasks = run.research_tasks.length >= 8 && run.research_tasks.length <= 12;
      const needsReview = run.determinations.some((item) => item.applies === "needs_review");
      // Real research is non-deterministic, so we no longer require the scripted
      // HMBP repair (repairs>=1 only happens in fixture mode). Instead assert the
      // defensibility invariant that holds in both modes: anything verified must
      // carry a grounded source URL + verbatim quote.
      const groundedWhereVerified = run.determinations
        .filter((item) => item.verified)
        .every((item) => item.source_url.length > 0 && item.quote.length > 0);
      return {
        passed: enoughTasks && needsReview && groundedWhereVerified,
        details: `tasks=${run.research_tasks.length} repairs=${run.repair_tickets.length} needsReview=${needsReview} groundedVerified=${groundedWhereVerified}`
      };
    }
  },
  {
    id: "missing-facts",
    description: "Facility omits key quantity and industry facts.",
    assert: async () => {
      const run = await runResearch({
        project_description: "Missing facts: facility adds unknown hazardous material but omits quantities and SIC."
      });
      const invented = run.determinations.some((item) => item.verified && item.project_fact.includes("missing"));
      const needsReview = run.determinations.some((item) => item.applies === "needs_review");
      return {
        passed: needsReview && !invented,
        details: `needsReview=${needsReview} inventedUnsupported=${invented}`
      };
    }
  }
];

async function main() {
  const results: EvalResult[] = [];

  for (const evalCase of cases) {
    const result = await evalCase.assert();
    results.push({ id: evalCase.id, ...result });
  }

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id}: ${result.details}`);
  }

  if (results.some((result) => !result.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
