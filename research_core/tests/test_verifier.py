"""Port of src/lib/research/__tests__/verifier.test.ts."""

from __future__ import annotations


from research_core.verifier import verify_evidence


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

_SCOPE: dict = {
    "run_id": "r",
    "facility": {
        "address": "X",
        "jurisdiction_stack": [],
        "naics": "323111",
        "sic": None,
    },
    "project_change": {
        "description": "d",
        "equipment": [],
        "chemicals": [],
        "waste_streams": [],
        "disturbance_acres": None,
        "process_discharge": None,
    },
    "missing_facts": [],
    "assumptions": [],
}

_QUOTE = "A permit to construct is required for this equipment."


def _bundle(over: dict | None = None) -> dict:
    base: dict = {
        "hypothesis_id": "H-AIR-201",
        "sources": [
            {
                "url": "https://www.aqmd.gov/x",
                "source_name": "SCAQMD Rule 201",
                "authority_rank": 1,
                "fetched_at": "2026-05-30T00:00:00Z",
                "content_hash": "sha256:z",
                "effective_date": None,
                "quote": _QUOTE,
            }
        ],
        "extracted_claims": [
            {
                "field": "permit_trigger",
                "value": "permit required",
                "source_url": "https://www.aqmd.gov/x",
                "quote": _QUOTE,
                "confidence": 0.9,
            }
        ],
        "researcher_conclusion": "applies",
        "uncertainties": [],
    }
    if over:
        base.update(over)
    return base


# ---------------------------------------------------------------------------
# Tests — mirrors verifyEvidence generic path in verifier.test.ts
# ---------------------------------------------------------------------------


def test_passes_grounded_decided_bundle():
    """Passes a grounded, decided bundle (quote appears in the cited source)."""
    v = verify_evidence(_SCOPE, _bundle())
    assert v["verdict"] == "pass"
    assert v["checks"]["grounding"]["pass"] is True
    assert v["checks"]["predicate_math"]["pass"] is True


def test_fails_and_emits_repair_ticket_when_ungrounded():
    """Fails + emits a repair ticket when the extracted claim quote is NOT in the source quote."""
    ungrounded = _bundle(
        {
            "extracted_claims": [
                {
                    "field": "permit_trigger",
                    "value": "x",
                    "source_url": "https://www.aqmd.gov/x",
                    "quote": "TEXT THAT IS NOT IN THE SOURCE",
                    "confidence": 0.9,
                }
            ]
        }
    )
    v = verify_evidence(_SCOPE, ungrounded)
    assert v["verdict"] == "fail"
    assert v["checks"]["grounding"]["pass"] is False
    assert len(v["repair_tickets"]) == 1
    assert v["repair_tickets"][0]["failed_check"] == "grounding"


def test_needs_review_when_grounded_but_no_decision():
    """needs_review when grounded but the researcher reached no decision."""
    undecided = _bundle({"researcher_conclusion": "needs_review"})
    v = verify_evidence(_SCOPE, undecided)
    assert v["verdict"] == "needs_review"
    assert v["checks"]["grounding"]["pass"] is True
    assert v["checks"]["predicate_math"]["pass"] is False


def test_needs_review_when_low_authority():
    """needs_review when source authority is low even if grounded + decided."""
    low_auth = _bundle(
        {
            "sources": [
                {
                    "url": "https://www.aqmd.gov/x",
                    "source_name": "blog",
                    "authority_rank": 3,
                    "fetched_at": "2026-05-30T00:00:00Z",
                    "content_hash": "sha256:z",
                    "effective_date": None,
                    "quote": "A permit to construct is required for this equipment.",
                }
            ]
        }
    )
    v = verify_evidence(_SCOPE, low_auth)
    assert v["verdict"] == "needs_review"
    assert v["checks"]["authority"]["pass"] is False
