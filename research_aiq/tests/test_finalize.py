"""finalize AIQ function — the deterministic, un-bypassable backstop.

Mirrors research_core/tests/test_run_recall_floor.py, but drives the recall floor
THROUGH the run-scoped STORE + _finalize_impl. Where the research_core test passes
empty evidence and hand-prunes the research_graph, this test investigates a real
SUBSET of candidates (seeding bundles for only the air hypothesis) and lets
_finalize_impl derive the prune from STORE.investigated_ids. That proves the
guarantee end-to-end: the supervisor may prune a candidate (here the HMBP/hazmat
hypothesis), but the recall floor STILL surfaces the expected-but-uninvestigated
program (ca-hmbp) as a needs_review determination — the model cannot make an
expected program silently disappear.
"""

from __future__ import annotations

import asyncio
import json

from research_aiq.functions.finalize import _finalize_impl
from research_aiq.run_store import STORE, set_run_id


def _scope_with(**overrides) -> dict:
    """The SCAQMD coating-booth + solvent scope from research_core's recall-floor test.

    equipment + chemicals -> the deterministic plan EXPECTS air programs AND the
    hazmat HMBP program (ca-hmbp, triggered by _has_chemicals).
    """
    project_change = {
        "description": "coating booth + flammable solvent",
        "equipment": [{"kind": "coating_booth", "description": ""}],
        "chemicals": [{"name": "solvent", "quantity": 60, "unit": "gal"}],
        "waste_streams": [],
        "disturbance_acres": None,
        "process_discharge": False,
    }
    project_change.update(overrides)
    return {
        "run_id": "fin1",
        "facility": {
            "address": "x",
            "jurisdiction_stack": ["SCAQMD"],
            "naics": None,
            "sic": None,
        },
        "project_change": project_change,
        "missing_facts": [],
        "assumptions": [],
    }


def _air_201_bundle() -> dict:
    """A well-formed evidence bundle for H-AIR-201 that passes the verifier's
    generalized grounding path (claim quote is a substring of the source quote,
    high authority, a decided conclusion). This makes the test exercise the full
    verify -> synthesize -> recall-floor pipeline over REAL gathered evidence,
    not a degenerate empty-evidence path.
    """
    quote = (
        "A person shall not build, install, or operate any equipment that may emit "
        "air contaminants without a written Permit to Construct."
    )
    return {
        "hypothesis_id": "H-AIR-201",
        "sources": [
            {
                "url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf",
                "source_name": "SCAQMD Rule 201",
                "authority_rank": 1,
                "fetched_at": "2026-05-30T00:00:00Z",
                "content_hash": "sha256:demo-air-201",
                "effective_date": None,
                "quote": quote,
            }
        ],
        "extracted_claims": [
            {
                "field": "permit_trigger",
                "value": "installing emitting equipment requires a Permit to Construct",
                "source_url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf",
                "quote": "without a written Permit to Construct",
                "confidence": 0.9,
            }
        ],
        "researcher_conclusion": "applies",
        "uncertainties": [],
    }


def test_finalize_recall_floor_surfaces_pruned_expected_program():
    """Investigate only the air hypothesis; assert the pruned hazmat program
    (ca-hmbp / HMBP) still surfaces as a needs_review determination and the
    overall run status is needs_review."""
    from research_core.planner import plan_research

    run_id = "fin1"
    scope = _scope_with()

    # Seed the store with the full candidate set the deterministic planner proposes.
    plan = plan_research(scope, [])
    STORE.init(run_id, scope=scope, candidates=plan["research_graph"])
    set_run_id(run_id)

    # Investigate ONLY a subset: one air hypothesis. Deliberately OMIT
    # H-HAZMAT-HMBP, whose program (ca-hmbp) the recall floor expects because the
    # scope has chemicals. _finalize_impl derives the prune from these bundles.
    STORE.add_bundles(run_id, [_air_201_bundle()])
    assert "H-HAZMAT-HMBP" not in STORE.investigated_ids(run_id)

    out = asyncio.run(_finalize_impl(json.dumps({"run_id": run_id})))
    result = json.loads(out)

    assert result["status"] == "needs_review"

    determinations = result["determinations"]
    hmbp_row = next(
        (
            d
            for d in determinations
            if d["requirement"] == "California Hazardous Materials Business Plan (HMBP)"
        ),
        None,
    )
    assert hmbp_row is not None, (
        "recall floor must add a row for the pruned-but-expected ca-hmbp program; "
        f"got requirements: {[d['requirement'] for d in determinations]}"
    )
    assert hmbp_row["applies"] == "needs_review"
    assert hmbp_row["review_flag"] is True


def test_finalize_unknown_run_is_fail_loud():
    """A missing run must raise (KeyError from the STORE), never fabricate a result."""
    import pytest

    with pytest.raises(KeyError):
        asyncio.run(_finalize_impl(json.dumps({"run_id": "does-not-exist"})))


def test_finalize_falls_back_to_contextvar_run_id():
    """In the live workflow finalize's input is the supervisor's FREEFORM text, not
    {"run_id": ...}. _finalize_impl must then resolve run_id from the contextvar that
    plan_candidates set earlier in the same run — and finalize the right run anyway.

    This is the load-bearing Gap-1 fix for the e2e: prove that given non-JSON input
    finalize still produces determinations for the contextvar-bound run.
    """
    from research_core.planner import plan_research

    run_id = "fin-ctxvar"
    scope = _scope_with()

    plan = plan_research(scope, [])
    STORE.init(run_id, scope=scope, candidates=plan["research_graph"])
    STORE.add_bundles(run_id, [_air_201_bundle()])
    set_run_id(run_id)  # the only place run_id is available — input has none

    # Freeform supervisor output: NOT JSON, no run_id field.
    out = asyncio.run(_finalize_impl("I spawned the air hypotheses and pruned the rest. Done."))
    result = json.loads(out)

    assert result["run_id"] == run_id  # resolved from the contextvar, not the input
    # Same recall-floor behavior as the JSON-input path: ca-hmbp is expected (scope
    # has chemicals) but was not investigated -> needs_review.
    assert result["status"] == "needs_review"
    hmbp_row = next(
        (
            d
            for d in result["determinations"]
            if d["requirement"] == "California Hazardous Materials Business Plan (HMBP)"
        ),
        None,
    )
    assert hmbp_row is not None
    assert hmbp_row["applies"] == "needs_review"


def test_finalize_no_run_id_anywhere_is_fail_loud():
    """No run_id in the input AND no active contextvar -> RuntimeError (no fabrication)."""
    import pytest

    from research_aiq.run_store import _run_id_var

    token = _run_id_var.set(None)  # ensure no leaked contextvar from a prior test
    try:
        with pytest.raises(RuntimeError, match="no run_id"):
            asyncio.run(_finalize_impl("freeform text with no run id at all"))
    finally:
        _run_id_var.reset(token)


def test_finalize_returns_full_research_run_shape():
    """finalize must surface the FULL ResearchRun (what the Node UI renders), not the
    trimmed {run_id, determinations, status}. The deployed orchestrate endpoint returns
    finalize's output verbatim, and the renderer needs research_graph (index-aligned
    with determinations), evidence_bundles, verification_verdicts, coverage families,
    trace_events, and report_markdown."""
    from research_core.planner import plan_research

    run_id = "fin-full"
    scope = _scope_with()
    plan = plan_research(scope, [])
    STORE.init(run_id, scope=scope, candidates=plan["research_graph"])
    STORE.add_bundles(run_id, [_air_201_bundle()])
    set_run_id(run_id)

    result = json.loads(asyncio.run(_finalize_impl(json.dumps({"run_id": run_id}))))

    for key in (
        "run_id",
        "status",
        "scope_pack",
        "coverage_family_statuses",
        "regulatory_angles",
        "research_graph",
        "research_tasks",
        "evidence_bundles",
        "verification_verdicts",
        "repair_tickets",
        "memory_updates",
        "determinations",
        "trace_events",
        "report_markdown",
    ):
        assert key in result, f"finalize output missing required ResearchRun key: {key}"
    assert any(h["id"] == "H-AIR-201" for h in result["research_graph"])
    assert isinstance(result["report_markdown"], str) and result["report_markdown"]
