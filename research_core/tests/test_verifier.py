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


# ---------------------------------------------------------------------------
# Regression: Fix 1 — operator-precedence crash when claim.quote is None/absent
# ---------------------------------------------------------------------------


def test_no_crash_when_claim_quote_is_none():
    """Regression: verify_evidence must not crash when extracted_claims[0]['quote'] is None.

    Before Fix 1, the expression `(claim.get("quote") if claim else "" or "")` had
    wrong operator precedence: the `or ""` bound to the *else* branch, not the whole
    conditional.  When claim was a non-empty dict whose "quote" was None, Python
    evaluated `None.strip()` → AttributeError.

    The TS original is `(claim?.quote ?? "").trim()`, i.e. coalesce the *quote*,
    not the else-branch.  The fix adds an extra pair of parentheses so the `or ""`
    coalesces the result of the entire conditional:
        ((claim.get("quote") if claim else "") or "").strip()

    This test uses the generalized grounding path (H-AIR-201 with a claim dict
    whose "quote" key is explicitly None).  The call must return a verdict dict
    (we accept "fail" or "needs_review" because an empty claim quote cannot be
    grounded) WITHOUT raising any exception.
    """
    bundle_null_quote = _bundle(
        {
            "extracted_claims": [
                {
                    "field": "permit_trigger",
                    "value": "permit required",
                    "source_url": "https://www.aqmd.gov/x",
                    "quote": None,  # explicitly None — triggers the crash before Fix 1
                    "confidence": 0.9,
                }
            ]
        }
    )
    # Must not raise AttributeError (or any other exception).
    verdict = verify_evidence(_SCOPE, bundle_null_quote)
    assert verdict["verdict"] in {"fail", "needs_review"}
    # Grounding must have failed (empty claim quote cannot be grounded)
    assert verdict["checks"]["grounding"]["pass"] is False
    # A repair ticket should be present because grounding failed
    assert len(verdict["repair_tickets"]) >= 1


def test_no_crash_when_claim_quote_absent():
    """Same regression with 'quote' key missing entirely from the claim dict."""
    bundle_no_quote_key = _bundle(
        {
            "extracted_claims": [
                {
                    "field": "permit_trigger",
                    "value": "permit required",
                    "source_url": "https://www.aqmd.gov/x",
                    # 'quote' key is absent
                    "confidence": 0.9,
                }
            ]
        }
    )
    verdict = verify_evidence(_SCOPE, bundle_no_quote_key)
    assert verdict["verdict"] in {"fail", "needs_review"}
    assert verdict["checks"]["grounding"]["pass"] is False
    assert len(verdict["repair_tickets"]) >= 1
