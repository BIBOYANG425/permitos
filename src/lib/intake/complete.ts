import type { IntakeFacts } from "./types";

const SCOPING_FIELDS = ["equipment", "chemicals", "waste_streams"] as const;

export type Completeness = { complete: boolean; missing: string[] };

// Demo completeness bar (option a): a project_change plus at least one concrete
// scoping fact. Deeper scope-completeness is guaranteed downstream by Person A's
// coverage floor, so this only needs to ensure the run has something to chew on.
export function isIntakeComplete(facts: IntakeFacts): Completeness {
  const missing: string[] = [];

  if (!facts.project_change || facts.project_change.trim().length === 0) {
    missing.push("project_change");
  }

  const hasScopingFact = SCOPING_FIELDS.some((field) => {
    const value = facts[field];
    return Array.isArray(value) && value.length > 0;
  });
  if (!hasScopingFact) {
    missing.push("equipment_or_chemicals_or_waste");
  }

  return { complete: missing.length === 0, missing };
}

export function followUpForMissing(missing: string[]): string {
  if (missing.includes("project_change")) {
    return "Before I scope this — what change are you making at the facility?";
  }
  if (missing.includes("equipment_or_chemicals_or_waste")) {
    return "Got it. To scope it I need at least one of: equipment you're adding, chemicals you'll store, or waste streams produced. Which applies?";
  }
  return "Could you tell me a bit more about the project?";
}
