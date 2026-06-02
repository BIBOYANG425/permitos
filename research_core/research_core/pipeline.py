"""Faithful Python port of the verify→repair loop and finalizeRun from
src/lib/research/run.ts.

Public API:
  run_verification(scope, fixture_evidence) → dict
  finalize_run(run_id, scope, plan, evidence, base_trace, sds_reviews=()) → dict

run_verification mirrors finalizeRun's verify/repair segment (fixture path).
finalize_run mirrors the full finalizeRun: verify/repair + synthesis + recall floor.
"""

from __future__ import annotations
import random

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


def _verify_and_repair(scope: dict, evidence: list[dict]) -> tuple[list[dict], list[dict]]:
    """Run one verify→repair→re-verify pass over *evidence*.

    Returns (verification_verdicts, evidence_bundles) as raw, pre-dedup lists.
    Each caller then applies _latest_by_hypothesis to get the final sets.

    Extracted to avoid duplicating this logic between run_verification and
    finalize_run (both had identical loop bodies before this helper).
    """
    evidence_bundles: list[dict] = list(evidence)
    verification_verdicts: list[dict] = []

    for bundle in evidence:
        verdict = verify_evidence(scope, bundle)
        verification_verdicts.append(verdict)
        for ticket in verdict["repair_tickets"]:
            repaired = repair_evidence(scope, ticket)
            evidence_bundles.append(repaired)
            verification_verdicts.append(verify_evidence(scope, repaired))

    return verification_verdicts, evidence_bundles


def run_verification(scope: dict, fixture_evidence: list[dict]) -> dict:
    """Mirror the verify→repair loop inside finalizeRun (fixture path).

    Steps (per bundle in fixture_evidence):
      1. verify_evidence → verdict
      2. For each repair_ticket in verdict: repair → repaired bundle → re-verify
    Then deduplicate both lists via _latest_by_hypothesis.
    """
    verification_verdicts, evidence_bundles = _verify_and_repair(scope, fixture_evidence)

    return {
        "verification_verdicts": _latest_by_hypothesis(verification_verdicts),
        "evidence_bundles": _latest_by_hypothesis(evidence_bundles),
    }


# ---------------------------------------------------------------------------
# Trace helper — mirrors trace() from trace.ts
# ---------------------------------------------------------------------------


def _trace(
    run_id: str,
    actor: str,
    phase: str,
    status: str,
    message: str,
    artifact_id: str | None = None,
) -> dict:
    """Mirror trace() from trace.ts. artifact_id is optional."""
    rand_suffix = "".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=8))
    id_suffix = artifact_id if artifact_id is not None else rand_suffix
    from datetime import datetime, timezone

    return {
        "id": f"trace_{actor}_{phase}_{id_suffix}",
        "run_id": run_id,
        "ts": datetime.now(tz=timezone.utc).isoformat(),
        "actor": actor,
        "phase": phase,
        "status": status,
        "message": message,
        "artifact_id": artifact_id,
    }


# ---------------------------------------------------------------------------
# Recall gap determination — mirrors recallGapDetermination() from run.ts
# ---------------------------------------------------------------------------


def _recall_gap_determination(program: dict) -> dict:
    """Mirror recallGapDetermination(program) from run.ts.

    A determination row for a program the registry expected for this scope but
    that no hypothesis investigated. Unverified, zero confidence, flagged for
    review — never presented as a settled "yes"/"no".
    """
    return {
        "requirement": program["name"],
        "applies": "needs_review",
        "trigger": f"Expected for this project scope but never investigated ({program['jurisdiction']}).",
        "project_fact": f"Recall gap — {program['family']} family program was not proposed",
        "citation": "No research performed — flagged by the recall floor",
        "quote": program["what_it_does"],
        "source_url": program["authority_source_url"],
        "confidence": 0,
        "verified": False,
        "review_flag": True,
    }


# ---------------------------------------------------------------------------
# finalize_run — mirrors finalizeRun() from run.ts
# ---------------------------------------------------------------------------


def finalize_run(
    run_id: str,
    scope: dict,
    plan: dict,
    evidence: list[dict],
    base_trace: list[dict],
    sds_reviews: list[dict] = (),
) -> dict:
    """Mirror finalizeRun() from run.ts (fixture/offline path).

    Args:
        run_id:     run identifier string
        scope:      ScopePack dict
        plan:       dict from plan_research() with keys: coverage_family_statuses,
                    regulatory_angles, research_graph, research_tasks
        evidence:   list of EvidenceBundle dicts (may be empty)
        base_trace: list of TraceEvent dicts to start from
        sds_reviews: list of SdsReview dicts (default empty)

    Returns a ResearchRun-shaped dict.
    """
    from research_core.synthesis import synthesize
    from research_core.completeness import verify_determination_set
    from research_core.program_registry import PROGRAM_REGISTRY

    trace_events: list[dict] = list(base_trace)

    # Verify/repair loop (fixture path — synchronous)
    verification_verdicts, evidence_bundles = _verify_and_repair(scope, evidence)

    # Collect repair tickets from all verdicts so finalize_run can surface them.
    repair_tickets: list[dict] = [
        ticket for verdict in verification_verdicts for ticket in verdict.get("repair_tickets", [])
    ]

    latest_verdicts = _latest_by_hypothesis(verification_verdicts)
    latest_evidence = _latest_by_hypothesis(evidence_bundles)

    synthesis = synthesize(
        scope,
        plan["research_graph"],
        plan["regulatory_angles"],
        latest_evidence,
        latest_verdicts,
        list(sds_reviews),
    )
    trace_events.append(
        _trace(run_id, "synthesis_agent", "matrix", "done", "Applicability matrix synthesized")
    )

    # Recall floor: re-derive the EXPECTED program set from registry x scope and
    # flag any program that was never investigated.
    investigated_hypotheses: set[str] = {h["id"] for h in plan["research_graph"]}
    proposed_program_ids: list[str] = [
        program["id"]
        for program in PROGRAM_REGISTRY
        if any(hid in investigated_hypotheses for hid in program["hypothesis_ids"])
    ]
    recall = verify_determination_set(scope, proposed_program_ids)
    for program in recall["missing"]:
        trace_events.append(
            _trace(
                run_id,
                "verifier",
                "recall_floor",
                "needs_review",
                f"Recall gap: {program['name']} is expected for this scope but was never investigated",
                program["id"],
            )
        )

    determinations = [
        *synthesis["determinations"],
        *[_recall_gap_determination(p) for p in recall["missing"]],
    ]
    status = "needs_review" if any(row["review_flag"] for row in determinations) else "done"

    return {
        "run_id": run_id,
        "status": status,
        "scope_pack": scope,
        "sds_reviews": list(sds_reviews),
        "coverage_family_statuses": plan["coverage_family_statuses"],
        "regulatory_angles": plan["regulatory_angles"],
        "research_graph": plan["research_graph"],
        "research_tasks": plan["research_tasks"],
        "evidence_bundles": latest_evidence,
        "verification_verdicts": latest_verdicts,
        "repair_tickets": repair_tickets,
        "memory_updates": synthesis["memory_updates"],
        "determinations": determinations,
        "trace_events": trace_events,
        "report_markdown": synthesis["report_markdown"],
    }
