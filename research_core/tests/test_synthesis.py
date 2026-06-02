"""Python port of src/lib/research/__tests__/synthesis.test.ts."""
from __future__ import annotations

import pytest
from research_core.synthesis import synthesize


# ---------------------------------------------------------------------------
# Shared fixtures (mirrors the TS test file's const declarations)
# ---------------------------------------------------------------------------

SCOPE: dict = {
    "run_id": "r",
    "facility": {
        "address": "X",
        "jurisdiction_stack": [],
        "naics": None,
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

HYPOTHESIS: dict = {
    "id": "H-AIR-201",
    "angle_id": "A-AIR",
    "family": "air",
    "question": "Permit to construct?",
    "required_facts": [],
    "expected_source_type": "regulation",
    "success_criteria": [],
    "dependencies": [],
}

ANGLE: dict = {
    "id": "A-AIR",
    "family": "air",
    "label": "Air permit",
    "reason": "",
    "triggering_facts": [],
    "status": "active",
}

PASS_VERDICT: dict = {
    "hypothesis_id": "H-AIR-201",
    "verdict": "pass",
    "checks": {"grounding": {"pass": True, "reason": ""}},
    "confidence": 0.9,
    "repair_tickets": [],
}


def _ev(conclusion: str) -> dict:
    """Build a minimal EvidenceBundle with the given researcher_conclusion."""
    return {
        "hypothesis_id": "H-AIR-201",
        "sources": [
            {
                "url": "u",
                "source_name": "s",
                "authority_rank": 1,
                "fetched_at": "2026-05-30T00:00:00Z",
                "content_hash": "h",
                "effective_date": None,
                "quote": "q",
            }
        ],
        "extracted_claims": [
            {
                "field": "permit_trigger",
                "value": "v",
                "source_url": "u",
                "quote": "q",
                "confidence": 0.9,
            }
        ],
        "researcher_conclusion": conclusion,
        "uncertainties": [],
    }


# ---------------------------------------------------------------------------
# Tests: synthesize reads researcher_conclusion
# ---------------------------------------------------------------------------

class TestSynthesizeReadsResearcherConclusion:
    def test_maps_verified_does_not_apply_to_applies_no(self):
        result = synthesize(SCOPE, [HYPOTHESIS], [ANGLE], [_ev("does_not_apply")], [PASS_VERDICT])
        det = result["determinations"][0]
        assert det["applies"] == "no"
        assert det["verified"] is True

    def test_maps_verified_applies_to_applies_yes(self):
        result = synthesize(SCOPE, [HYPOTHESIS], [ANGLE], [_ev("applies")], [PASS_VERDICT])
        det = result["determinations"][0]
        assert det["applies"] == "yes"
