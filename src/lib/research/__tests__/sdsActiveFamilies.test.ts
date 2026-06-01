import { describe, expect, it } from "vitest";
import { sdsActiveFamilies } from "../sdsFamilies";
import type { SdsReview } from "@/lib/sds/types";

function reviewWithFacts(fields: string[]): SdsReview {
  return {
    document: { id: "doc1", name: "acetone-sds", run_id: "r", source_type: "pasted_text", retention: "ephemeral", extracted_text: "", extracted_at: "2026-06-01T00:00:00Z" },
    overall_status: "reviewed",
    findings: [],
    permit_handoff_facts: fields.map((field) => ({
      field,
      value: true,
      source_section: 9,
      quote: "q",
      confidence: 0.85,
      review_flag: true,
      reason: "r",
    })),
  } as unknown as SdsReview;
}

describe("sdsActiveFamilies", () => {
  it("maps a VOC air-emissions fact to the air family", () => {
    const families = sdsActiveFamilies([reviewWithFacts(["voc_air_emissions_review"])]);
    expect(families.has("air")).toBe(true);
  });

  it("maps hazardous material/flammable facts to hazmat", () => {
    const families = sdsActiveFamilies([reviewWithFacts(["flammable_liquid_storage_review"])]);
    expect(families.has("hazmat")).toBe(true);
  });

  it("maps hazardous waste facts to waste", () => {
    const families = sdsActiveFamilies([reviewWithFacts(["hazardous_waste_review"])]);
    expect(families.has("waste")).toBe(true);
  });

  it("ignores facts whose value is false or review_flag is false", () => {
    const review = reviewWithFacts(["voc_air_emissions_review"]);
    (review.permit_handoff_facts[0] as { value: boolean }).value = false;
    const families = sdsActiveFamilies([review]);
    expect(families.has("air")).toBe(false);
  });

  it("returns an empty set for no reviews", () => {
    expect(sdsActiveFamilies([]).size).toBe(0);
  });
});
