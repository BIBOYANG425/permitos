import type { ResearchRunInput, ScopePack } from "./types";
import { seededComplexScope, seededConstructionScope, seededMissingFactsScope } from "./fixtures/scenarios";

export function createRunId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function parseScope(input: ResearchRunInput, runId: string): ScopePack {
  const description = input.project_description.trim();
  const normalized = description.toLowerCase();

  if (normalized.includes("missing") || normalized.includes("omit") || normalized.includes("unknown")) {
    return seededMissingFactsScope(runId, description);
  }

  if (normalized.includes("1.2 acre") || normalized.includes("construction")) {
    return seededConstructionScope(runId, description);
  }

  return seededComplexScope(runId, description);
}

export function projectFacts(scope: ScopePack): Record<string, unknown> {
  return {
    address: scope.facility.address,
    naics: scope.facility.naics,
    sic: scope.facility.sic,
    equipment: scope.project_change.equipment,
    chemicals: scope.project_change.chemicals,
    waste_streams: scope.project_change.waste_streams,
    disturbance_acres: scope.project_change.disturbance_acres,
    process_discharge: scope.project_change.process_discharge,
    missing_facts: scope.missing_facts
  };
}
