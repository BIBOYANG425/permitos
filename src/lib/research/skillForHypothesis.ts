// Maps each research hypothesis the planner can emit (see hypothesesFor() in
// src/lib/research/planner.ts) to the EHS skill the researcher should read as
// just-in-time orienting context (src/lib/research/skills/<id>/SKILL.md).
//
// The mapping is per hypothesis (a family can span several skills — e.g. air covers
// both the SCAQMD district rules and the federal Title V permit):
//   air        -> scaqmd-air, caa-title-v
//   stormwater -> ca-stormwater
//   hazmat     -> ca-hmbp, epcra-community-right-to-know
//   waste      -> hazwaste-generator
//   wastewater -> industrial-pretreatment
//   osha       -> osha-psm
//
// Keep this in sync with planner.ts: every hypothesis id emitted by hypothesesFor()
// MUST have an entry here, and every target must be a real skill dir on disk.
// src/lib/research/__tests__/skillsParity.test.ts enforces both invariants.

export const SKILL_FOR_HYPOTHESIS: Record<string, string> = {
  // air
  "H-AIR-201": "scaqmd-air",
  "H-AIR-VOC": "scaqmd-air",
  "H-AIR-219": "scaqmd-air",
  "H-AIR-222": "scaqmd-air",
  "H-AIR-TITLEV": "caa-title-v",
  // stormwater
  "H-STORM-IGP": "ca-stormwater",
  "H-STORM-CGP": "ca-stormwater",
  // hazmat
  "H-HAZMAT-HMBP": "ca-hmbp",
  "H-HAZMAT-EPCRA": "epcra-community-right-to-know",
  // waste
  "H-WASTE-GENERATOR": "hazwaste-generator",
  // wastewater
  "H-WASTEWATER-PRETREATMENT": "industrial-pretreatment",
  // osha (worker safety)
  "H-OSHA-PSM": "osha-psm",
};

// Returns the skill id for a hypothesis id, or null if none is mapped.
export function skillForHypothesis(id: string): string | null {
  return SKILL_FOR_HYPOTHESIS[id] ?? null;
}
