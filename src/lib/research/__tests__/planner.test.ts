import { describe, expect, it } from "vitest";
import { planResearch } from "../planner";
import { scopePackFromFacts } from "../scope";

describe("planResearch — count varies with facts", () => {
  it("equipment-only project activates air but not hazmat/waste", () => {
    const scope = scopePackFromFacts({ equipment: [{ kind: "oven" }], naics: "323111" }, "r1", "two ovens");
    const plan = planResearch(scope);
    const families = new Set(plan.research_graph.map((h) => h.family));
    expect(families.has("air")).toBe(true);
    expect(plan.research_graph.some((h) => h.id === "H-HAZMAT-HMBP")).toBe(false);
    expect(plan.research_graph.some((h) => h.id === "H-WASTE-GENERATOR")).toBe(false);
  });

  it("a richer project spawns strictly more hypotheses than the equipment-only one", () => {
    const lean = planResearch(scopePackFromFacts({ equipment: [{ kind: "oven" }], naics: "323111" }, "r1", "ovens"));
    const rich = planResearch(
      scopePackFromFacts(
        {
          equipment: [{ kind: "coating booth" }],
          chemicals: [{ name: "solvent", quantity: 60, unit: "gallons" }],
          waste_streams: [{ description: "spent solvent", kg_per_month: 10 }],
          naics: "323111",
          process_discharge: true,
        },
        "r2",
        "complex",
      ),
    );
    expect(rich.research_graph.length).toBeGreaterThan(lean.research_graph.length);
    expect(rich.research_graph.some((h) => h.id === "H-HAZMAT-HMBP")).toBe(true);
  });
});
