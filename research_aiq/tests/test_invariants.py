"""Tests for research_aiq.invariants — always-on, pure output checks.

These mirror the REAL research_core schemas. `_good_run()` drives the genuine
finalize_run pipeline (verify -> repair -> synthesize -> recall floor) over the
SCAQMD coating-booth + solvent scope, producing real determinations, then wraps
the output in the recorded-run shape check_invariants expects
({"scope", "determinations", "status"}). Each failing test mutates exactly one
thing and asserts exactly the targeted invariant fires.

Schema facts the fixtures rely on (confirmed against research_core):
  - Determination row: {requirement, applies, trigger, project_fact, citation,
    quote, source_url, confidence, verified, review_flag}. No hypothesis_id on the
    row — the requirement label links it back to a hypothesis via _requirement_for.
  - EvidenceBundle: {hypothesis_id, sources: [{url, quote, ...}], extracted_claims,
    researcher_conclusion, uncertainties}. The verbatim source text is sources[i].quote.
  - "Expected programs" = research_core.completeness.expected_programs_for_scope(scope),
    the same registry x scope derivation finalize's recall floor uses.
"""

from __future__ import annotations

import copy

from research_core.pipeline import finalize_run
from research_core.planner import plan_research

from research_aiq.invariants import check_invariants


# ---------------------------------------------------------------------------
# Shared fixtures — the SCAQMD coating-booth + solvent scope (matches
# research_aiq/tests/test_finalize.py and research_core's recall-floor test).
# ---------------------------------------------------------------------------


def _scope() -> dict:
    """equipment + chemicals -> the recall floor EXPECTS the air programs AND the
    hazmat HMBP/EPCRA + OSHA-PSM programs (triggered by _has_chemicals)."""
    return {
        "run_id": "inv1",
        "facility": {
            "address": "x",
            "jurisdiction_stack": ["SCAQMD"],
            "naics": None,
            "sic": None,
        },
        "project_change": {
            "description": "coating booth + flammable solvent",
            "equipment": [{"kind": "coating_booth", "description": ""}],
            "chemicals": [{"name": "solvent", "quantity": 60, "unit": "gal"}],
            "waste_streams": [],
            "disturbance_acres": None,
            "process_discharge": False,
        },
        "missing_facts": [],
        "assumptions": [],
    }


def _air_201_bundle() -> dict:
    """Well-formed H-AIR-201 bundle: the claim quote is a verbatim substring of the
    source quote, authority is high, conclusion is decided -> the verifier passes it
    and synthesis emits a VERIFIED determination whose quote IS the source quote."""
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


def _good_run() -> tuple[dict, list[dict]]:
    """A genuine, clean recorded run.

    Investigate ONLY H-AIR-201 (a real subset). finalize_run verifies it (verified
    determination, applies=yes), synthesizes the other air rows as needs_review, and
    the recall floor surfaces the uninvestigated-but-expected programs (HMBP, EPCRA,
    OSHA-PSM, Title V) as needs_review recall-gap rows. So in this run:
      (a) the one verified row's quote is verbatim-present in its source bundle,
      (b) every expected program appears (verified air + needs_review for the rest),
      (c) every needs_review row is honestly uncertain (none claim a confident yes/no).
    """
    scope = _scope()
    bundles = [_air_201_bundle()]

    plan = plan_research(scope, [])
    keep = {b["hypothesis_id"] for b in bundles}
    pruned = {
        **plan,
        "research_graph": [h for h in plan["research_graph"] if h["id"] in keep],
        "research_tasks": [t for t in plan["research_tasks"] if t["hypothesis_id"] in keep],
    }
    run = finalize_run("inv1", scope, pruned, bundles, [], [])

    # The recorded-run dict check_invariants consumes. scope is REQUIRED for
    # invariant (b) — it derives the expected-program set the same way finalize does.
    result = {
        "run_id": run["run_id"],
        "scope": scope,
        "determinations": run["determinations"],
        "status": run["status"],
    }
    return result, bundles


# ---------------------------------------------------------------------------
# (clean) — no violations
# ---------------------------------------------------------------------------


def test_clean_run_has_no_violations():
    result, bundles = _good_run()
    assert check_invariants(result, bundles) == []


# ---------------------------------------------------------------------------
# (a) grounding — verified determination whose quote is NOT in its source
# ---------------------------------------------------------------------------


def test_detects_verified_without_verbatim_quote():
    result, bundles = _good_run()

    # Find the verified row (H-AIR-201's "SCAQMD Permit to Construct/Operate review").
    verified = next(d for d in result["determinations"] if d["verified"])
    assert verified["applies"] == "yes"  # sanity: it really is a confident, verified row

    # Mutate ONLY the quote so it is no longer present in any source bundle, while
    # leaving verified=True. The source bundle quote is untouched.
    verified["quote"] = "This sentence appears in no cited source whatsoever."

    violations = check_invariants(result, bundles)
    assert violations != []
    assert any("quote" in v.lower() or "verbatim" in v.lower() for v in violations)
    # The violation must name the offending requirement so a human can act.
    assert any(verified["requirement"] in v for v in violations)


# ---------------------------------------------------------------------------
# (b) recall-floor coverage — an expected program entirely absent
# ---------------------------------------------------------------------------


def test_detects_missing_expected_program():
    result, bundles = _good_run()

    # ca-hmbp is expected (scope has chemicals). In the clean run it appears as a
    # recall-gap row named "California Hazardous Materials Business Plan (HMBP)".
    # Remove it ENTIRELY -> the program is now absent from the determinations.
    target = "California Hazardous Materials Business Plan (HMBP)"
    before = [d["requirement"] for d in result["determinations"]]
    assert target in before
    result["determinations"] = [d for d in result["determinations"] if d["requirement"] != target]

    violations = check_invariants(result, bundles)
    assert violations != []
    assert any(
        "expected" in v.lower() or "missing" in v.lower() or "absent" in v.lower()
        for v in violations
    )
    # Name the program (or its id) so the gap is actionable.
    assert any(target in v or "ca-hmbp" in v for v in violations)


# ---------------------------------------------------------------------------
# (c) honest uncertainty — confident yes/no on a missing decision-relevant fact
# ---------------------------------------------------------------------------


def test_detects_confident_answer_on_missing_fact():
    result, bundles = _good_run()

    # Add a bundle whose researcher could NOT decide (researcher_conclusion =
    # needs_review + a stated uncertainty) — i.e. a missing decision-relevant fact.
    # Then dishonestly mark its determination a confident, verified "no".
    bundles = copy.deepcopy(bundles)
    bundles.append(
        {
            "hypothesis_id": "H-STORM-IGP",
            "sources": [
                {
                    "url": "https://www.waterboards.ca.gov/igp",
                    "source_name": "CA IGP",
                    "authority_rank": 1,
                    "fetched_at": "2026-05-30T00:00:00Z",
                    "content_hash": "sha256:demo-igp",
                    "effective_date": None,
                    "quote": "Industrial activities in regulated SIC codes must obtain IGP coverage.",
                }
            ],
            "extracted_claims": [],
            "researcher_conclusion": "needs_review",
            "uncertainties": ["SIC/NAICS is missing; coverage cannot be determined."],
        }
    )
    # Synthesis would normally emit this as needs_review; simulate a determination
    # that dishonestly claims a confident, verified "no" despite the missing fact.
    result["determinations"].append(
        {
            "requirement": "California Industrial General Permit applicability",
            "applies": "no",
            "trigger": "Is the facility subject to the Industrial General Permit?",
            "project_fact": "SIC missing / NAICS missing",
            "citation": "CA IGP, fetched 2026-05-30",
            "quote": "Industrial activities in regulated SIC codes must obtain IGP coverage.",
            "source_url": "https://www.waterboards.ca.gov/igp",
            "confidence": 0.9,
            "verified": True,
            "review_flag": False,
        }
    )

    violations = check_invariants(result, bundles)
    assert violations != []
    assert any("needs_review" in v or "missing" in v.lower() for v in violations)
    assert any("California Industrial General Permit applicability" in v for v in violations)
