import { describe, expect, it } from "vitest";
import { planResearch } from "../planner";
import type { CoverageFamily, ScopePack } from "../types";

// Minimal scope: no equipment, no chemicals, no waste — every fact-driven family
// would normally be out_of_scope or blocked.
const bareScope: ScopePack = {
  run_id: "run_test",
  facility: { address: "site", jurisdiction_stack: [], naics: null, sic: null },
  project_change: {
    description: "bare",
    equipment: [],
    chemicals: [],
    waste_streams: [],
    disturbance_acres: null,
    process_discharge: null,
  },
  missing_facts: [],
  assumptions: [],
};

describe("planResearch SDS activation", () => {
  it("activates air when SDS flags it, even with no equipment", () => {
    const plan = planResearch(bareScope, new Set<CoverageFamily>(["air"]));
    const air = plan.coverage_family_statuses.find((c) => c.family === "air");
    expect(air?.status).toBe("active");
    expect(air?.reason.toLowerCase()).toContain("sds");
    expect(plan.research_graph.map((h) => h.id)).toContain("H-AIR-VOC");
  });

  it("activates hazmat when SDS flags it, even with no chemicals", () => {
    const plan = planResearch(bareScope, new Set<CoverageFamily>(["hazmat"]));
    expect(plan.coverage_family_statuses.find((c) => c.family === "hazmat")?.status).toBe("active");
  });

  it("activates waste when SDS flags it, even with no waste streams", () => {
    const plan = planResearch(bareScope, new Set<CoverageFamily>(["waste"]));
    expect(plan.coverage_family_statuses.find((c) => c.family === "waste")?.status).toBe("active");
  });

  it("leaves air out_of_scope when neither equipment nor SDS flags it", () => {
    const plan = planResearch(bareScope);
    expect(plan.coverage_family_statuses.find((c) => c.family === "air")?.status).toBe("out_of_scope");
  });
});
