// The recall floor. A verifier that only sees the proposed set is blind to a
// wholly-missed family; this re-derives the EXPECTED set from the registry x scope
// and diffs it against what was proposed. Anything expected-but-not-proposed is a
// recall gap (flag needs_review, never ship as "complete").
import type { ScopePack } from "./types";
import { PROGRAM_REGISTRY, type ProgramRegistryEntry } from "./programRegistry";

export function expectedProgramsForScope(scope: ScopePack): ProgramRegistryEntry[] {
  return PROGRAM_REGISTRY.filter((p) => {
    try {
      return p.triggeredBy(scope);
    } catch {
      // A broken trigger must never silently drop a program from the expected set.
      return true;
    }
  });
}

export type CompletenessResult = {
  expected: ProgramRegistryEntry[];
  proposed: string[];
  missing: ProgramRegistryEntry[];
};

export function verifyDeterminationSet(scope: ScopePack, proposedIds: string[]): CompletenessResult {
  const proposed = new Set(proposedIds);
  const expected = expectedProgramsForScope(scope);
  const missing = expected.filter((p) => !proposed.has(p.id));
  return { expected, proposed: proposedIds, missing };
}
