import type { CoverageFamily } from "./types";
import type { SdsReview } from "@/lib/sds/types";

// Maps each SDS permit-handoff field to the coverage family it should activate.
// Keeps the SDS reviewer (src/lib/sds/reviewer.ts PERMIT_HANDOFF_RULES) and the
// planner's coverage families in sync: an SDS that flags VOC content must open
// the air family, a flammable/hazmat fact must open hazmat, and so on.
const FIELD_TO_FAMILY: Record<string, CoverageFamily> = {
  voc_air_emissions_review: "air",
  hazardous_material_inventory_review: "hazmat",
  flammable_liquid_storage_review: "hazmat",
  incompatible_storage_review: "hazmat",
  california_ehs_review: "hazmat",
  hazardous_waste_review: "waste",
  spill_stormwater_containment_review: "stormwater",
};

// Coverage families an SDS review affirmatively flags. Only facts that are both
// value===true and review_flag===true count, mirroring how synthesis consumes them.
export function sdsActiveFamilies(reviews: SdsReview[]): Set<CoverageFamily> {
  const families = new Set<CoverageFamily>();
  for (const review of reviews) {
    for (const fact of review.permit_handoff_facts) {
      if (fact.value !== true || !fact.review_flag) continue;
      const family = FIELD_TO_FAMILY[fact.field];
      if (family) families.add(family);
    }
  }
  return families;
}
