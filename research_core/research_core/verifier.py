"""Faithful Python port of src/lib/research/verifier.ts.

verify_evidence(scope, bundle) → verdict dict
repair_evidence(scope, ticket) → repaired evidence bundle dict

All data is plain dicts (NOT dataclasses).
"""

from __future__ import annotations

import re

from research_core._format import js_str
from research_core.confidence import compute_confidence


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _norm_ws(value: str) -> str:
    """Collapse whitespace runs, mirroring normWs from TS."""
    return re.sub(r"\s+", " ", value).strip()


def _needs_review(hypothesis_id: str, failure_type: str, reason: str) -> dict:
    """Mirror the needsReview helper."""
    checks = {
        "currency": {"pass": True, "reason": "source/cache status recorded"},
        "authority": {
            "pass": True,
            "reason": "authority could be evaluated or source failure was explicit",
        },
        "grounding": {"pass": failure_type != "source_failed", "reason": reason},
        "predicate_math": {"pass": False, "reason": reason},
    }
    return {
        "hypothesis_id": hypothesis_id,
        "verdict": "needs_review",
        "checks": checks,
        "confidence": compute_confidence(checks),
        "repair_tickets": [],
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def verify_evidence(scope: dict, bundle: dict) -> dict:
    """Mirror verifyEvidence from verifier.ts."""
    sources = bundle.get("sources", [])
    source = sources[0] if sources else None

    # --- no source ---
    if not source:
        return _needs_review(
            bundle["hypothesis_id"], "source_failed", "No source was returned by the worker."
        )

    hypothesis_id = bundle["hypothesis_id"]

    # --- HMBP demo-bad branch ---
    if hypothesis_id == "H-HAZMAT-HMBP" and source.get("content_hash") == "sha256:demo-hmbp-bad":
        checks = {
            "currency": {"pass": True, "reason": "source fetched from seeded cache for this run"},
            "authority": {"pass": True, "reason": "official/high-authority HMBP source fixture"},
            "grounding": {
                "pass": False,
                "reason": "Quote mentions threshold quantities, but extracted claim says all hazardous material storage.",
            },
            "predicate_math": {
                "pass": False,
                "reason": "No threshold was extracted from the quoted text.",
            },
        }
        return {
            "hypothesis_id": hypothesis_id,
            "verdict": "fail",
            "checks": checks,
            "confidence": compute_confidence(checks),
            "repair_tickets": [
                {
                    "ticket_id": "R-HAZMAT-HMBP-001",
                    "hypothesis_id": hypothesis_id,
                    "failure_type": "grounding_failed",
                    "failed_check": "grounding",
                    "observed_problem": "Extracted claim was broader than the supporting quote.",
                    "repair_action": "rerun extraction with quote-constrained threshold comparison",
                    "max_attempts_remaining": 1,
                }
            ],
        }

    # --- HMBP repaired / threshold path ---
    if hypothesis_id == "H-HAZMAT-HMBP":
        chemicals = scope.get("project_change", {}).get("chemicals", [])
        chemical = chemicals[0] if chemicals else None
        quantity = chemical.get("quantity") if chemical else None

        extracted_claims = bundle.get("extracted_claims", [])
        threshold_claim = next(
            (c for c in extracted_claims if c.get("field") == "liquid_gallons_threshold"), None
        )
        threshold = float(threshold_claim["value"]) if threshold_claim else None
        if threshold is not None and (threshold != threshold):  # NaN check
            threshold = None

        if quantity is None or threshold is None:
            return _needs_review(
                hypothesis_id,
                "missing_fact",
                "Hazardous material quantity or threshold is missing.",
            )

        passes_threshold = quantity >= threshold
        op = ">=" if passes_threshold else "<"
        # JS stringifies Number(55) as "55" (not "55.0") — strip trailing ".0"
        threshold_str = str(int(threshold)) if threshold == int(threshold) else str(threshold)
        pred_reason = f"{js_str(quantity)} gallons {op} {threshold_str} gallon threshold."
        checks = {
            "currency": {"pass": True, "reason": "source fetched from seeded cache for this run"},
            "authority": {"pass": True, "reason": "official/high-authority HMBP source fixture"},
            "grounding": {
                "pass": True,
                "reason": "quote contains the liquid hazardous material threshold",
            },
            "predicate_math": {
                "pass": passes_threshold,
                "reason": pred_reason,
            },
        }

        return {
            "hypothesis_id": hypothesis_id,
            "verdict": "pass" if passes_threshold else "needs_review",
            "checks": checks,
            "confidence": compute_confidence(checks),
            "repair_tickets": [],
        }

    # --- H-WASTE-GENERATOR missing fact ---
    if hypothesis_id == "H-WASTE-GENERATOR":
        waste_streams = scope.get("project_change", {}).get("waste_streams", [])
        missing = any(ws.get("kg_per_month") is None for ws in waste_streams)
        if missing:
            return _needs_review(
                hypothesis_id, "missing_fact", "Monthly hazardous waste quantity is missing."
            )

    # --- H-WASTEWATER-PRETREATMENT missing fact ---
    if hypothesis_id == "H-WASTEWATER-PRETREATMENT":
        process_discharge = scope.get("project_change", {}).get("process_discharge")
        if process_discharge is None:
            return _needs_review(
                hypothesis_id, "missing_fact", "Process wastewater discharge status is missing."
            )

    # --- H-STORM-CGP ---
    if hypothesis_id == "H-STORM-CGP":
        acres = scope.get("project_change", {}).get("disturbance_acres")
        passes_threshold = isinstance(acres, (int, float)) and acres >= 1
        if passes_threshold:
            pred_reason = f"{js_str(acres)} acres is at or above the 1 acre threshold."
        else:
            # TS: `${acres ?? "missing"} acres does not trigger a verified yes.`
            acres_str = js_str(acres) if acres is not None else "missing"
            pred_reason = f"{acres_str} acres does not trigger a verified yes."
        checks = {
            "currency": {"pass": True, "reason": "source fetched from seeded cache for this run"},
            "authority": {"pass": True, "reason": "official state stormwater source fixture"},
            "grounding": {
                "pass": True,
                "reason": "quote contains one-acre construction disturbance threshold",
            },
            "predicate_math": {
                "pass": passes_threshold,
                "reason": pred_reason,
            },
        }
        return {
            "hypothesis_id": hypothesis_id,
            "verdict": "pass" if passes_threshold else "needs_review",
            "checks": checks,
            "confidence": compute_confidence(checks),
            "repair_tickets": [],
        }

    # --- H-STORM-IGP missing SIC/NAICS ---
    if hypothesis_id == "H-STORM-IGP":
        facility = scope.get("facility", {})
        if not facility.get("sic") and not facility.get("naics"):
            return _needs_review(
                hypothesis_id,
                "missing_fact",
                "SIC/NAICS is missing; industrial stormwater coverage cannot be verified.",
            )

    # --- Generalized grounding path ---
    extracted_claims = bundle.get("extracted_claims", [])
    claim = extracted_claims[0] if extracted_claims else None

    source_quote = _norm_ws((source.get("quote") or "").strip())
    claim_quote = _norm_ws(((claim.get("quote") if claim else "") or "").strip())

    grounded = len(source_quote) > 0 and len(claim_quote) > 0 and claim_quote in source_quote

    conclusion = bundle.get("researcher_conclusion")
    decided = conclusion in ("applies", "does_not_apply")

    fetched_at = source.get("fetched_at") or ""
    currency_reason = (
        f"source fetched {fetched_at[:10]}" if fetched_at else "source fetched (unknown)"
    )

    authority_rank = source.get("authority_rank", 99)
    authority_pass = authority_rank <= 2
    authority_reason = (
        "official or high-authority source" if authority_pass else "source authority rank is low"
    )

    grounding_reason = (
        "extracted claim quote appears in the cited source quote"
        if grounded
        else "extracted claim is not grounded in the cited source quote"
    )

    pred_reason_general = (
        f"researcher reached a grounded conclusion: {conclusion}"
        if decided
        else "researcher could not reach a grounded conclusion"
    )

    checks = {
        "currency": {"pass": True, "reason": currency_reason},
        "authority": {"pass": authority_pass, "reason": authority_reason},
        "grounding": {"pass": grounded, "reason": grounding_reason},
        "predicate_math": {"pass": decided, "reason": pred_reason_general},
    }

    if not grounded:
        return {
            "hypothesis_id": hypothesis_id,
            "verdict": "fail",
            "checks": checks,
            "confidence": compute_confidence(checks),
            "repair_tickets": [
                {
                    "ticket_id": f"R-{hypothesis_id}-001",
                    "hypothesis_id": hypothesis_id,
                    "failure_type": "grounding_failed",
                    "failed_check": "grounding",
                    "observed_problem": "Extracted claim is not supported by a verbatim quote from the cited source.",
                    "repair_action": "rerun extraction constrained to verbatim source text",
                    "max_attempts_remaining": 1,
                }
            ],
        }

    return {
        "hypothesis_id": hypothesis_id,
        "verdict": "pass" if (authority_pass and decided) else "needs_review",
        "checks": checks,
        "confidence": compute_confidence(checks),
        "repair_tickets": [],
    }


# Fixture/demo repair — mirrors repairEvidence in verifier.ts
_HMBP_REPAIRED_FIXTURE = {
    "url": "https://calepa.ca.gov/cupa/hazardous-materials-business-plan/",
    "source_name": "California HMBP Threshold Summary",
    "authority_rank": 1,
    "fetched_at": "2026-05-30T00:00:00Z",
    "content_hash": "sha256:demo-hmbp-repaired",
    "effective_date": None,
    "quote": (
        "A hazardous material must be reported when present in quantities equal to or greater than "
        "55 gallons for liquids, 500 pounds for solids, or 200 cubic feet for compressed gases."
    ),
    "extracted_liquid_gallons_threshold": 55,
}


def repair_evidence(scope: dict, ticket: dict) -> dict:
    """Mirror repairEvidence from verifier.ts (fixture/demo path only)."""
    hypothesis_id = ticket["hypothesis_id"]

    if hypothesis_id != "H-HAZMAT-HMBP":
        return {
            "hypothesis_id": hypothesis_id,
            "sources": [],
            "extracted_claims": [],
            "researcher_conclusion": "needs_review",
            "uncertainties": [f"No scripted repair available for {hypothesis_id}"],
        }

    fixture = _HMBP_REPAIRED_FIXTURE
    chemicals = scope.get("project_change", {}).get("chemicals", [])
    chemical = chemicals[0] if chemicals else None
    quantity = chemical.get("quantity") if chemical else None
    threshold = float(fixture["extracted_liquid_gallons_threshold"])

    # JS stringifies Number(55) as "55" not "55.0"
    threshold_str = str(int(threshold)) if threshold == int(threshold) else str(threshold)

    if quantity is None:
        predicate_value = "missing quantity"
        predicate_confidence = 0.2
        researcher_conclusion = "needs_review"
        uncertainties = ["Chemical quantity missing; cannot compare HMBP threshold."]
    else:
        predicate_value = f"{js_str(quantity)} gallons >= {threshold_str} gallons"
        predicate_confidence = 0.92
        researcher_conclusion = "applies" if quantity >= threshold else "needs_review"
        uncertainties = []

    return {
        "hypothesis_id": hypothesis_id,
        "sources": [
            {
                "url": fixture["url"],
                "source_name": fixture["source_name"],
                "authority_rank": fixture["authority_rank"],
                "fetched_at": fixture["fetched_at"],
                "content_hash": fixture["content_hash"],
                "effective_date": fixture["effective_date"],
                "quote": fixture["quote"],
            }
        ],
        "extracted_claims": [
            {
                "field": "liquid_gallons_threshold",
                "value": str(int(threshold)),
                "source_url": fixture["url"],
                "quote": fixture["quote"],
                "confidence": 0.91,
            },
            {
                "field": "predicate_math",
                "value": predicate_value,
                "source_url": fixture["url"],
                "quote": fixture["quote"],
                "confidence": predicate_confidence,
            },
        ],
        "researcher_conclusion": researcher_conclusion,
        "uncertainties": uncertainties,
    }
