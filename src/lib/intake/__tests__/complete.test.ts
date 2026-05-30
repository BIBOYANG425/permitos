import { describe, expect, it } from "vitest";
import { followUpForMissing, isIntakeComplete } from "../complete";
import type { IntakeFacts } from "../types";

describe("isIntakeComplete", () => {
  it("is complete with project_change plus a scoping fact", () => {
    const facts: IntakeFacts = {
      project_change: "Adding a coating booth.",
      chemicals: [{ name: "solvent", quantity: 60, unit: "gallons" }],
    };
    expect(isIntakeComplete(facts)).toEqual({ complete: true, missing: [] });
  });

  it("is incomplete when only project_change is present", () => {
    const result = isIntakeComplete({ project_change: "Adding a line." });
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("equipment_or_chemicals_or_waste");
  });

  it("is incomplete when project_change is absent", () => {
    const result = isIntakeComplete({ equipment: [{ kind: "booth" }] });
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("project_change");
  });

  it("treats empty arrays as no scoping fact", () => {
    const result = isIntakeComplete({ project_change: "x", equipment: [], chemicals: [] });
    expect(result.complete).toBe(false);
  });
});

describe("followUpForMissing", () => {
  it("returns a non-empty question for each missing case", () => {
    expect(followUpForMissing(["project_change"]).length).toBeGreaterThan(0);
    expect(followUpForMissing(["equipment_or_chemicals_or_waste"]).length).toBeGreaterThan(0);
    expect(followUpForMissing([]).length).toBeGreaterThan(0);
  });
});
