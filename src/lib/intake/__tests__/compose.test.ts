import { describe, expect, it } from "vitest";
import { composeProjectDescription } from "../compose";
import type { IntakeFacts } from "../types";

const FACTS: IntakeFacts = {
  address: "Los Angeles County manufacturing facility",
  jurisdiction_stack: ["SCAQMD", "California Water Boards", "Local CUPA"],
  naics: "332813",
  sic: "3471",
  project_change: "Adding a coating booth and storing a new flammable solvent.",
  equipment: [{ kind: "coating booth" }],
  chemicals: [{ name: "flammable solvent", quantity: 60, unit: "gallons", hazard: "flammable" }],
  waste_streams: [{ description: "spent solvent", kg_per_month: null }],
  disturbance_acres: 0,
  process_discharge: null,
};

describe("composeProjectDescription", () => {
  it("includes the key captured facts", () => {
    const text = composeProjectDescription(FACTS);
    expect(text).toContain("coating booth");
    expect(text).toContain("60");
    expect(text).toContain("flammable solvent");
    expect(text).toContain("332813");
  });

  it("avoids parseScope trigger keywords so it routes to the complex scenario", () => {
    const text = composeProjectDescription(FACTS).toLowerCase();
    for (const trigger of ["unknown", "missing", "omit", "construction", "1.2 acre"]) {
      expect(text).not.toContain(trigger);
    }
  });

  it("uses neutral phrasing for absent values", () => {
    const text = composeProjectDescription({
      project_change: "New process line.",
      chemicals: [{ name: "acetone", quantity: null, unit: null }],
      waste_streams: [{ description: "rinse water", kg_per_month: null }],
    });
    expect(text).toContain("Southern California");
    expect(text).toContain("New process line.");
    expect(text).toContain("acetone");
    expect(text.toLowerCase()).not.toContain("unknown");
  });
});
