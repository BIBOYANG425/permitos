import { describe, expect, it } from "vitest";
import { emptyScope, scopePackFromFacts } from "../scope";

describe("scopePackFromFacts", () => {
  it("normalizes extracted facts into a ScopePack", () => {
    const scope = scopePackFromFacts(
      {
        address: "Oxnard, CA",
        naics: "323111",
        equipment: [{ kind: "laser printer" }, { kind: "coating booth", description: "new" }],
        chemicals: [{ name: "flammable solvent", quantity: 60, unit: "gallons" }],
        waste_streams: [{ description: "spent solvent", kg_per_month: null }],
        disturbance_acres: 0,
        process_discharge: null,
      },
      "run_1",
      "desc",
    );
    expect(scope.facility.address).toBe("Oxnard, CA");
    expect(scope.facility.naics).toBe("323111");
    expect(scope.facility.sic).toBeNull();
    expect(scope.project_change.equipment.map((e) => e.kind)).toEqual(["laser printer", "coating booth"]);
    expect(scope.project_change.chemicals[0].quantity).toBe(60);
    expect(scope.project_change.waste_streams[0].kg_per_month).toBeNull();
    // missing facts flagged for the blocked dimensions
    const missing = scope.missing_facts.map((m) => m.field);
    expect(missing).toContain("waste_streams.kg_per_month");
    expect(missing).toContain("project_change.process_discharge");
  });

  it("drops malformed list entries and defaults unknowns to null", () => {
    const scope = scopePackFromFacts(
      { equipment: [{} as { kind: string }, { kind: "oven" }], chemicals: undefined },
      "run_2",
      "desc",
    );
    expect(scope.project_change.equipment.map((e) => e.kind)).toEqual(["oven"]);
    expect(scope.project_change.chemicals).toEqual([]);
    expect(scope.project_change.disturbance_acres).toBeNull();
  });
});

describe("emptyScope", () => {
  it("yields a fact-free scope that blocks everything", () => {
    const scope = emptyScope("run_3", "some description");
    expect(scope.project_change.equipment).toEqual([]);
    expect(scope.project_change.chemicals).toEqual([]);
    expect(scope.project_change.waste_streams).toEqual([]);
    expect(scope.facility.naics).toBeNull();
    expect(scope.facility.sic).toBeNull();
    expect(scope.project_change.description).toBe("some description");
    expect(scope.missing_facts.length).toBeGreaterThan(0);
  });
});
