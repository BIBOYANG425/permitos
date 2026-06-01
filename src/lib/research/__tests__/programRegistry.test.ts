import { describe, it, expect } from "vitest";
import { PROGRAM_REGISTRY, allPrograms, programsForFamily } from "../programRegistry";
import { planResearch } from "../planner";
import type { ScopePack } from "../types";

const maximalScope: ScopePack = {
  run_id: "t",
  facility: { address: "x", jurisdiction_stack: ["SCAQMD"], naics: "332999", sic: "3499" },
  project_change: {
    description: "test",
    equipment: [{ kind: "coating_booth", description: "" }],
    chemicals: [{ name: "solvent", quantity: 60, unit: "gal" }],
    waste_streams: [{ description: "spent solvent", kg_per_month: 50 }],
    disturbance_acres: 2,
    process_discharge: true,
  },
  missing_facts: [],
  assumptions: [],
};

describe("programRegistry", () => {
  it("has a unique id per entry", () => {
    const ids = PROGRAM_REGISTRY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every hypothesis the planner can emit", () => {
    const emitted = new Set(planResearch(maximalScope).research_graph.map((h) => h.id));
    const covered = new Set(PROGRAM_REGISTRY.flatMap((p) => p.hypothesis_ids));
    expect([...emitted].filter((h) => !covered.has(h))).toEqual([]);
  });

  it("programsForFamily filters by family", () => {
    expect(programsForFamily("air").length).toBeGreaterThan(0);
    expect(programsForFamily("air").every((p) => p.family === "air")).toBe(true);
  });

  it("allPrograms returns the full registry", () => {
    expect(allPrograms().length).toBe(PROGRAM_REGISTRY.length);
  });
});
