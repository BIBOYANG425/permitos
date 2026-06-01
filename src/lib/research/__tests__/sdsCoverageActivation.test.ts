import { describe, expect, it } from "vitest";
import { runResearch } from "@/lib/research/run";

// Full multi-section SDS the reviewer can parse: VOC content in §9, flammable in
// §2/§7, hazardous waste in §13.
const SDS_TEXT = `
Section 1: Identification
Product identifier: Solvent Blend 42.
Section 2: Hazard(s) identification
Danger. Highly flammable liquid and vapor. Pictograms: flame.
Section 7: Handling and storage
Store in a flammable liquid storage cabinet. Keep away from ignition sources.
Section 9: Physical and chemical properties
Flash point: -4 F. VOC content: 620 g/L. Vapor pressure: 180 mmHg at 20 C.
Section 13: Disposal considerations
Dispose of contents and containers as hazardous waste.
`;

describe("SDS coverage activation (the reported bug)", () => {
  it("opens the air family from a VOC SDS even with no emitting equipment in intake", async () => {
    const run = await runResearch({
      project_description:
        "A Southern California light industrial construction project disturbing 1.2 acres with no chemical inventory provided.",
      demo_documents: [{ name: "Solvent SDS", type: "sds", text: SDS_TEXT }],
    });

    // SDS reviews must be attached to the run.
    expect(run.sds_reviews ?? []).toHaveLength(1);
    expect(run.sds_reviews?.[0].permit_handoff_facts.some((f) => f.field === "voc_air_emissions_review")).toBe(true);

    // Air family activated by the SDS, not by equipment.
    const air = run.coverage_family_statuses.find((c) => c.family === "air");
    expect(air?.status).toBe("active");

    // An air/VOC determination appears in the matrix and carries its SDS provenance.
    const voc = run.determinations.find((d) => d.requirement.toLowerCase().includes("voc"));
    expect(voc).toBeDefined();
    expect(voc?.sds_handoff_refs?.map((f) => f.field)).toEqual(
      expect.arrayContaining(["voc_air_emissions_review"]),
    );
  });
});
