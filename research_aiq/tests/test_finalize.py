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
