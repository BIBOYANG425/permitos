"""Pure helpers for the PermitPilot Modal research worker.

No third-party imports (no modal/httpx/openai) so this is unit-testable in any
plain Python environment. worker.py does the I/O and imports these.
"""
from __future__ import annotations

from urllib.parse import urlparse

# hypothesis_id -> the single official source the worker may fetch (the allowlist).
SOURCE_POINTERS: dict[str, dict] = {
    "H-AIR-201": {"source_name": "SCAQMD Rule 201", "url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf", "authority_rank": 1},
    "H-AIR-VOC": {"source_name": "SCAQMD Rule 201", "url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf", "authority_rank": 1},
    "H-AIR-219": {"source_name": "SCAQMD Rule 219", "url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-219.pdf", "authority_rank": 1},
    "H-AIR-222": {"source_name": "SCAQMD Rule 222", "url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-222.pdf", "authority_rank": 1},
    "H-STORM-IGP": {"source_name": "California Industrial General Permit", "url": "https://www.waterboards.ca.gov/water_issues/programs/stormwater/industrial.html", "authority_rank": 1},
    "H-STORM-CGP": {"source_name": "California Construction General Permit", "url": "https://www.waterboards.ca.gov/water_issues/programs/stormwater/construction.html", "authority_rank": 1},
    "H-HAZMAT-HMBP": {"source_name": "California HMBP Threshold Summary", "url": "https://calepa.ca.gov/cupa/hazardous-materials-business-plan/", "authority_rank": 1},
    "H-WASTE-GENERATOR": {"source_name": "EPA Hazardous Waste Generator Categories", "url": "https://www.epa.gov/hwgenerators/categories-hazardous-waste-generators", "authority_rank": 1},
    "H-WASTEWATER-PRETREATMENT": {"source_name": "EPA Pretreatment Program Overview", "url": "https://www.epa.gov/npdes/national-pretreatment-program", "authority_rank": 1},
}

# Per-hypothesis extraction guidance. `field` MUST match what verifier.ts reads
# for its math branches (liquid_gallons_threshold for HMBP); others are informational.
EXTRACTION_HINTS: dict[str, dict] = {
    "H-HAZMAT-HMBP": {"field": "liquid_gallons_threshold", "ask": "the numeric gallon threshold at or above which a Hazardous Materials Business Plan (HMBP) is required for a hazardous liquid"},
    "H-STORM-CGP": {"field": "acreage_threshold", "ask": "the number of acres of soil disturbance that triggers Construction General Permit coverage"},
    "H-STORM-IGP": {"field": "regulated_sic", "ask": "which industrial activities or SIC categories must obtain Industrial General Permit coverage"},
    "H-AIR-201": {"field": "permit_trigger", "ask": "what equipment or activity requires written authorization or a permit to construct"},
    "H-AIR-VOC": {"field": "permit_trigger", "ask": "what equipment or activity requires written authorization or a permit to construct"},
    "H-AIR-219": {"field": "exemption_check_required", "ask": "which equipment is exempt from written permit requirements and under what conditions"},
    "H-AIR-222": {"field": "registration_possible", "ask": "which equipment may use registration instead of a full permit"},
    "H-WASTE-GENERATOR": {"field": "generator_quantity_required", "ask": "what monthly hazardous waste quantity determines the generator category"},
    "H-WASTEWATER-PRETREATMENT": {"field": "process_discharge_required", "ask": "when industrial process wastewater discharge triggers pretreatment requirements"},
}

ALLOWED_HOSTS = {
    "www.aqmd.gov", "aqmd.gov",
    "www.waterboards.ca.gov", "waterboards.ca.gov",
    "calepa.ca.gov", "www.calepa.ca.gov",
    "www.epa.gov", "epa.gov",
}


def host_allowed(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in ALLOWED_HOSTS


def failed_bundle(hypothesis_id: str, reason: str) -> dict:
    return {
        "hypothesis_id": hypothesis_id,
        "sources": [],
        "extracted_claims": [],
        "researcher_conclusion": "needs_review",
        "uncertainties": [reason],
    }


def assemble_evidence(hypothesis_id: str, pointer: dict, content_hash: str, fetched_at: str, extract: dict) -> dict:
    """Pure mapping: extraction result + fetch metadata -> EvidenceBundle dict.

    Falls back to needs_review when no verbatim quote was grounded.
    """
    quote = (extract.get("verbatim_quote") or "").strip()
    if not quote:
        return failed_bundle(hypothesis_id, "No supporting verbatim quote found in the fetched source.")

    field = extract.get("field") or "source_claim"
    value = extract.get("threshold_value")
    applies = extract.get("applies") or "needs_review"
    try:
        confidence = float(extract.get("confidence"))
    except (TypeError, ValueError):
        confidence = 0.5

    return {
        "hypothesis_id": hypothesis_id,
        "sources": [
            {
                "url": pointer["url"],
                "source_name": pointer["source_name"],
                "authority_rank": pointer["authority_rank"],
                "fetched_at": fetched_at,
                "content_hash": content_hash,
                "effective_date": extract.get("effective_date"),
                "quote": quote,
            }
        ],
        "extracted_claims": [
            {
                "field": field,
                "value": "" if value is None else str(value),
                "source_url": pointer["url"],
                "quote": quote,
                "confidence": confidence,
            }
        ],
        "researcher_conclusion": applies if applies in ("applies", "does_not_apply", "needs_review") else "needs_review",
        "uncertainties": [],
    }
