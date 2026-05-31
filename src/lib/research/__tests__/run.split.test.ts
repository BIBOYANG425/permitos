import { describe, it, expect } from "vitest";
import { planRun, finalizeRun } from "../run";
import { runLocalResearchPool } from "../workers";

describe("run.ts split", () => {
  it("planRun + pool + finalizeRun produces determinations for a fixture run", async () => {
    const planned = await planRun({ project_description: "A facility adds a coating booth and stores 60 gallons of flammable solvent." });
    expect(planned.run_id).toMatch(/^run_/);
    expect(planned.plan.research_tasks.length).toBeGreaterThan(0);
    const pool = await runLocalResearchPool(planned.plan.research_tasks, planned.plan.research_graph);
    const run = finalizeRun(planned.run_id, planned.scope_pack, planned.plan, pool.bundles, planned.trace_events);
    expect(run.determinations.length).toBe(planned.plan.research_graph.length);
    expect(run.report_markdown).toContain("Applicability Matrix");
  });
});
