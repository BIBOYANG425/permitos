"""Port of src/lib/research/__tests__/run.repair.test.ts.

Tests the HMBP fail→repair→verified arc through run_verification.
Fixture mode: the verifier rejects the overbroad HMBP claim (demo content hash),
the orchestrator repairs from the canned repaired source, and the re-verify passes
via threshold math (60 gal >= 55 gal). Hermetic — no live scope parsing.
"""

from __future__ import annotations


from research_core.pipeline import run_verification


# ---------------------------------------------------------------------------
# Shared scope / evidence
# ---------------------------------------------------------------------------

_SCOPE: dict = {
    "run_id": "repair-test",
    "facility": {
        "address": "x",
        "jurisdiction_stack": ["CalEPA"],
        "naics": None,
        "sic": None,
    },
    "project_change": {
        "description": "stores 60 gallons of flammable solvent",
        "equipment": [],
        "chemicals": [{"name": "solvent", "quantity": 60, "unit": "gal", "hazard": "flammable"}],
        "waste_streams": [],
        "disturbance_acres": None,
        "process_discharge": False,
    },
    "missing_facts": [],
    "assumptions": [],
}


def _bad_hmbp_bundle() -> dict:
    """The 'bad' HMBP evidence the fixture pool emits: overbroad claim, demo content hash."""
    quote = "Businesses must submit information for hazardous materials at or above threshold quantities."
    return {
        "hypothesis_id": "H-HAZMAT-HMBP",
        "sources": [
            {
                "url": "https://calepa.ca.gov/cupa/hazardous-materials-business-plan/",
                "source_name": "California HMBP Threshold Summary",
                "authority_rank": 1,
                "fetched_at": "2026-05-30T00:00:00Z",
                "content_hash": "sha256:demo-hmbp-bad",
                "effective_date": None,
                "quote": quote,
            }
        ],
        "extracted_claims": [
            {
                "field": "overbroad_claim",
                "value": "HMBP applies to all hazardous material storage",
                "source_url": "https://calepa.ca.gov/cupa/hazardous-materials-business-plan/",
                "quote": quote,
                "confidence": 0.82,
            }
        ],
        "researcher_conclusion": "applies",
        "uncertainties": [],
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_repair_arc_rejects_overbroad_hmbp_and_repair_passes():
    """Verifier rejects the overbroad HMBP claim, repairs, and the re-verify passes.

    60 gal >= 55 gal threshold from the repaired fixture source.
    """
    result = run_verification(_SCOPE, [_bad_hmbp_bundle()])

    # The initial verdict emitted a repair ticket for HMBP
    all_verdicts = result["verification_verdicts"]
    # The latest (post-repair) HMBP verdict passes
    hmbp_verdict = next((v for v in all_verdicts if v["hypothesis_id"] == "H-HAZMAT-HMBP"), None)
    assert hmbp_verdict is not None
    assert hmbp_verdict["verdict"] == "pass", (
        f"Expected 'pass', got '{hmbp_verdict['verdict']}': {hmbp_verdict}"
    )

    # The latest HMBP evidence is the repaired source (threshold 55), not the overbroad claim
    hmbp_evidence = next(
        (b for b in result["evidence_bundles"] if b["hypothesis_id"] == "H-HAZMAT-HMBP"), None
    )
    assert hmbp_evidence is not None
    claim_fields = [c["field"] for c in hmbp_evidence.get("extracted_claims", [])]
    assert "liquid_gallons_threshold" in claim_fields, (
        f"Expected liquid_gallons_threshold in repaired claims, got: {claim_fields}"
    )


def test_repair_arc_emits_repair_ticket():
    """The initial verify step must emit a repair ticket for H-HAZMAT-HMBP."""
    from research_core.verifier import verify_evidence

    initial_verdict = verify_evidence(_SCOPE, _bad_hmbp_bundle())
    assert initial_verdict["verdict"] == "fail"
    assert any(t["hypothesis_id"] == "H-HAZMAT-HMBP" for t in initial_verdict["repair_tickets"]), (
        f"No HMBP repair ticket: {initial_verdict['repair_tickets']}"
    )


def test_repair_arc_predicate_math_check_passes():
    """After repair, the predicate_math check specifically passes (60 >= 55)."""
    result = run_verification(_SCOPE, [_bad_hmbp_bundle()])
    hmbp_verdict = next(
        (v for v in result["verification_verdicts"] if v["hypothesis_id"] == "H-HAZMAT-HMBP"), None
    )
    assert hmbp_verdict is not None
    assert hmbp_verdict["checks"]["predicate_math"]["pass"] is True
