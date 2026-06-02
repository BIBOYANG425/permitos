"""Faithful Python port of src/lib/research/__tests__/completeness.test.ts.

Tests for expected_programs_for_scope and verify_determination_set (recall floor).
"""

from __future__ import annotations

from research_core.completeness import expected_programs_for_scope, verify_determination_set


def _scope_with(**overrides) -> dict:
    """Mirror the scopeWith() helper from the TS test file."""
    project_change = {
        "description": "test",
        "equipment": [{"kind": "coating_booth", "description": ""}],
        "chemicals": [{"name": "solvent", "quantity": 60, "unit": "gal"}],
        "waste_streams": [],
        "disturbance_acres": None,
        "process_discharge": False,
    }
    project_change.update(overrides)
    return {
        "run_id": "t",
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


class TestVerifyDeterminationSetRecallFloor:
    def test_flags_applicable_program_orchestrator_never_proposed(self):
        """flags an applicable program the orchestrator never proposed"""
        scope = _scope_with()  # equipment + chemicals -> air + hazmat expected
        # Orchestrator proposed only the air programs and dropped hazmat entirely.
        proposed = [
            "scaqmd-permit-to-construct",
            "scaqmd-rule-219-exemption",
            "scaqmd-rule-222-registration",
        ]
        result = verify_determination_set(scope, proposed)
        missing_ids = [p["id"] for p in result["missing"]]
        assert "ca-hmbp" in missing_ids

    def test_reports_no_gaps_when_proposed_set_covers_every_expected_program(self):
        """reports no gaps when the proposed set covers every expected program"""
        scope = _scope_with()
        proposed = [p["id"] for p in expected_programs_for_scope(scope)]
        assert verify_determination_set(scope, proposed)["missing"] == []

    def test_does_not_expect_programs_whose_family_is_out_of_scope(self):
        """does not expect programs whose family is out of scope"""
        scope = _scope_with(chemicals=[], waste_streams=[])  # no hazmat, no waste
        expected_ids = [p["id"] for p in expected_programs_for_scope(scope)]
        assert "ca-hmbp" not in expected_ids
        assert "epa-hazwaste-generator" not in expected_ids
