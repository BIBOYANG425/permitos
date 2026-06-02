"""Faithful Python port of the verify→repair loop from src/lib/research/run.ts.

run_verification(scope, fixture_evidence) → dict with:
  - verification_verdicts: list of deduplicated (latest per hypothesis_id) verdict dicts
  - evidence_bundles:      list of deduplicated (latest per hypothesis_id) evidence dicts

Mirrors finalizeRun's verify/repair segment. In fixture mode the repair is always the
canned repair_evidence (no live agent re-run).
"""

from __future__ import annotations

from research_core.verifier import repair_evidence, verify_evidence


def _latest_by_hypothesis(items: list[dict]) -> list[dict]:
    """Mirror latestByHypothesis from run.ts.

    Keep the LAST item per hypothesis_id; return values in first-seen key order.
    A plain dict keyed by hypothesis_id does exactly this (insertion-order in Py3.7+).
    """
    seen: dict[str, dict] = {}
    for item in items:
        seen[item["hypothesis_id"]] = item
    return list(seen.values())


def run_verification(scope: dict, fixture_evidence: list[dict]) -> dict:
    """Mirror the verify→repair loop inside finalizeRun (fixture path).

    Steps (per bundle in fixture_evidence):
      1. verify_evidence → verdict
      2. For each repair_ticket in verdict: repair → repaired bundle → re-verify
    Then deduplicate both lists via _latest_by_hypothesis.
    """
    evidence_bundles = list(fixture_evidence)
    verification_verdicts: list[dict] = []

    for bundle in fixture_evidence:
        verdict = verify_evidence(scope, bundle)
        verification_verdicts.append(verdict)
        for ticket in verdict["repair_tickets"]:
            repaired = repair_evidence(scope, ticket)
            evidence_bundles.append(repaired)
            verification_verdicts.append(verify_evidence(scope, repaired))

    return {
        "verification_verdicts": _latest_by_hypothesis(verification_verdicts),
        "evidence_bundles": _latest_by_hypothesis(evidence_bundles),
    }
