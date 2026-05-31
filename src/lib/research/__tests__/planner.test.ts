import { describe, expect, it } from "vitest";
import { planResearch } from "../planner";
import type { ScopePack } from "../types";

describe("researcher budget", () => {
  it("gives each research task at least 4 model calls for the agentic loop", () => {
    const scope: ScopePack = {
      run_id: "test_run",
      facility: { address: "X", jurisdiction_stack: [], naics: null, sic: null },
      project_change: {
        description: "test project",
        equipment: [{ kind: "coating_booth", description: "booth" }],
        chemicals: [{ name: "solvent", quantity: 60, unit: "gal", hazard: "flammable" }],
        waste_streams: [],
        disturbance_acres: null,
        process_discharge: null,
      },
      missing_facts: [],
      assumptions: [],
    };
    const plan = planResearch(scope);
    expect(plan.research_tasks.length).toBeGreaterThan(0);
    expect(plan.research_tasks.every((t) => t.budget.max_model_calls >= 4)).toBe(true);
  });
});
