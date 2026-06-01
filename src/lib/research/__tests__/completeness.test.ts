import { describe, it, expect } from "vitest";
import { expectedProgramsForScope, verifyDeterminationSet } from "../completeness";
import type { ScopePack } from "../types";

function scopeWith(overrides: Partial<ScopePack["project_change"]> = {}): ScopePack {
  return {
    run_id: "t",
    facility: { address: "x", jurisdiction_stack: ["SCAQMD"], naics: null, sic: null },
    project_change: {
      description: "test",
      equipment: [{ kind: "coating_booth", description: "" }],
      chemicals: [{ name: "solvent", quantity: 60, unit: "gal" }],
      waste_streams: [],
      disturbance_acres: null,
      process_discharge: false,
      ...overrides,
    },
    missing_facts: [],
    assumptions: [],
  };
}

describe("verifyDeterminationSet (recall floor)", () => {
  it("flags an applicable program the orchestrator never proposed", () => {
    const scope = scopeWith(); // equipment + chemicals -> air + hazmat expected
    // Orchestrator proposed only the air programs and dropped hazmat entirely.
    const proposed = ["scaqmd-permit-to-construct", "scaqmd-rule-219-exemption", "scaqmd-rule-222-registration"];
    const result = verifyDeterminationSet(scope, proposed);
    expect(result.missing.map((p) => p.id)).toContain("ca-hmbp");
  });

  it("reports no gaps when the proposed set covers every expected program", () => {
    const scope = scopeWith();
    const proposed = expectedProgramsForScope(scope).map((p) => p.id);
    expect(verifyDeterminationSet(scope, proposed).missing).toEqual([]);
  });

  it("does not expect programs whose family is out of scope", () => {
    const scope = scopeWith({ chemicals: [], waste_streams: [] }); // no hazmat, no waste
    const expectedIds = expectedProgramsForScope(scope).map((p) => p.id);
    expect(expectedIds).not.toContain("ca-hmbp");
    expect(expectedIds).not.toContain("epa-hazwaste-generator");
  });
});
