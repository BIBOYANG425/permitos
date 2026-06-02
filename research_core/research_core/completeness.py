"""Faithful Python port of src/lib/research/completeness.ts.

The recall floor. A verifier that only sees the proposed set is blind to a
wholly-missed family; this re-derives the EXPECTED set from the registry x scope
and diffs it against what was proposed. Anything expected-but-not-proposed is a
recall gap (flag needs_review, never ship as "complete").

Public API:
  expected_programs_for_scope(scope) -> list[dict]
  verify_determination_set(scope, proposed_ids) -> dict
"""

from __future__ import annotations

from research_core.program_registry import PROGRAM_REGISTRY


def expected_programs_for_scope(scope: dict) -> list[dict]:
    """Mirror expectedProgramsForScope(scope) from completeness.ts.

    Filters PROGRAM_REGISTRY by each entry's scope predicate (stored under
    the "triggered_by" key). A broken trigger must never silently drop a
    program from the expected set — exceptions are caught and treated as True.
    """
    result: list[dict] = []
    for program in PROGRAM_REGISTRY:
        try:
            triggered = program["triggered_by"](scope)
        except Exception:
            # A broken trigger must never silently drop a program.
            triggered = True
        if triggered:
            result.append(program)
    return result


def verify_determination_set(scope: dict, proposed_ids: list[str]) -> dict:
    """Mirror verifyDeterminationSet(scope, proposedIds) from completeness.ts.

    Returns a CompletenessResult dict with exact TS field names:
      {
        "expected": list[dict],   # all registry entries triggered by scope
        "proposed": list[str],    # the proposedIds passed in (verbatim)
        "missing":  list[dict],   # expected entries whose id is not in proposed
      }
    """
    proposed = set(proposed_ids)
    expected = expected_programs_for_scope(scope)
    missing = [p for p in expected if p["id"] not in proposed]
    return {
        "expected": expected,
        "proposed": proposed_ids,
        "missing": missing,
    }
