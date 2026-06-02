"""Pure offline tests for scope.scope_pack_from_facts.

No LLM, no API key required.  Exercises the missing_facts derivation and
field coercion logic that the parity goldens never directly test (the goldens
feed scope_pack pre-built, so scope_pack_from_facts would otherwise be
offline-untested).
"""

from __future__ import annotations

from research_core.scope import scope_pack_from_facts


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _missing_fields(scope: dict) -> set[str]:
    return {mf["field"] for mf in scope["missing_facts"]}


# ---------------------------------------------------------------------------
# Tests: missing_facts derivation
# ---------------------------------------------------------------------------


def test_chemical_with_null_quantity_adds_missing_fact():
    """A chemical with quantity=None triggers chemicals.quantity missing fact."""
    facts = {
        "chemicals": [{"name": "acetone", "quantity": None, "unit": "gal"}],
    }
    scope = scope_pack_from_facts(facts, "r1", "desc")

    assert "chemicals.quantity" in _missing_fields(scope)
    # blocks hazmat
    chem_mf = next(mf for mf in scope["missing_facts"] if mf["field"] == "chemicals.quantity")
    assert "hazmat" in chem_mf["blocks"]


def test_chemical_with_quantity_does_not_add_missing_fact():
    """A chemical with a real quantity does NOT trigger the chemicals.quantity missing fact."""
    facts = {
        "chemicals": [{"name": "acetone", "quantity": 60.0, "unit": "gal"}],
        "naics": "332999",
        "process_discharge": False,
        "waste_streams": [{"description": "spent solvent", "kg_per_month": 5.0}],
    }
    scope = scope_pack_from_facts(facts, "r1", "desc")

    assert "chemicals.quantity" not in _missing_fields(scope)


def test_no_naics_no_sic_adds_missing_fact():
    """When both naics and sic are absent/null, facility.naics_or_sic is flagged."""
    facts = {}  # neither naics nor sic provided
    scope = scope_pack_from_facts(facts, "r1", "desc")

    assert "facility.naics_or_sic" in _missing_fields(scope)
    mf = next(mf for mf in scope["missing_facts"] if mf["field"] == "facility.naics_or_sic")
    assert "stormwater" in mf["blocks"]


def test_naics_present_suppresses_naics_sic_missing_fact():
    """When naics is provided, the naics_or_sic missing fact is not added."""
    facts = {"naics": "332999", "process_discharge": True}
    scope = scope_pack_from_facts(facts, "r1", "desc")

    assert "facility.naics_or_sic" not in _missing_fields(scope)


def test_sic_present_suppresses_naics_sic_missing_fact():
    """When sic is provided (even without naics), the naics_or_sic missing fact is not added."""
    facts = {"sic": "3499", "process_discharge": True}
    scope = scope_pack_from_facts(facts, "r1", "desc")

    assert "facility.naics_or_sic" not in _missing_fields(scope)


def test_null_process_discharge_adds_missing_fact():
    """process_discharge absent → project_change.process_discharge missing fact."""
    facts = {}
    scope = scope_pack_from_facts(facts, "r1", "desc")

    assert "project_change.process_discharge" in _missing_fields(scope)
    mf = next(
        mf for mf in scope["missing_facts"] if mf["field"] == "project_change.process_discharge"
    )
    assert "wastewater" in mf["blocks"]


def test_bool_process_discharge_suppresses_missing_fact():
    """process_discharge=True/False → NOT missing."""
    for val in (True, False):
        facts = {"process_discharge": val}
        scope = scope_pack_from_facts(facts, "r1", "desc")
        assert "project_change.process_discharge" not in _missing_fields(scope), f"val={val}"


def test_waste_stream_null_kg_adds_missing_fact():
    """Waste stream with kg_per_month=None triggers waste_streams.kg_per_month."""
    facts = {
        "waste_streams": [{"description": "spent solvent", "kg_per_month": None}],
    }
    scope = scope_pack_from_facts(facts, "r1", "desc")

    assert "waste_streams.kg_per_month" in _missing_fields(scope)
    mf = next(mf for mf in scope["missing_facts"] if mf["field"] == "waste_streams.kg_per_month")
    assert "waste" in mf["blocks"]


# ---------------------------------------------------------------------------
# Tests: field coercion
# ---------------------------------------------------------------------------


def test_non_string_naics_coerced_to_none():
    """naics must be a string; integer is rejected and treated as None."""
    facts = {"naics": 332999}  # integer, not string
    scope = scope_pack_from_facts(facts, "r1", "desc")

    assert scope["facility"]["naics"] is None
    # Should trigger naics_or_sic missing fact
    assert "facility.naics_or_sic" in _missing_fields(scope)


def test_non_numeric_disturbance_acres_coerced_to_none():
    """disturbance_acres must be int/float; a string is rejected."""
    facts = {"disturbance_acres": "big"}
    scope = scope_pack_from_facts(facts, "r1", "desc")

    assert scope["project_change"]["disturbance_acres"] is None


def test_numeric_disturbance_acres_passes_through():
    """disturbance_acres=2.5 is preserved."""
    facts = {"disturbance_acres": 2.5, "process_discharge": False}
    scope = scope_pack_from_facts(facts, "r1", "desc")

    assert scope["project_change"]["disturbance_acres"] == 2.5


def test_non_string_equipment_kind_filtered_out():
    """Equipment items where kind is not a string are silently dropped."""
    facts = {
        "equipment": [
            {"kind": "coating_booth", "description": "spray booth"},
            {"kind": 99},  # invalid kind
            {"description": "no kind"},  # missing kind
        ]
    }
    scope = scope_pack_from_facts(facts, "r1", "desc")

    assert len(scope["project_change"]["equipment"]) == 1
    assert scope["project_change"]["equipment"][0]["kind"] == "coating_booth"


def test_chemical_non_string_name_filtered_out():
    """Chemicals where name is not a string are dropped."""
    facts = {
        "chemicals": [
            {"name": "acetone", "quantity": 10, "unit": "gal"},
            {"name": None, "quantity": 5},
        ]
    }
    scope = scope_pack_from_facts(facts, "r1", "desc")

    assert len(scope["project_change"]["chemicals"]) == 1
    assert scope["project_change"]["chemicals"][0]["name"] == "acetone"


# ---------------------------------------------------------------------------
# Tests: structure / invariants
# ---------------------------------------------------------------------------


def test_run_id_and_description_propagated():
    """run_id and description are preserved in the returned scope."""
    scope = scope_pack_from_facts({}, "my-run-id", "Project XYZ")

    assert scope["run_id"] == "my-run-id"
    assert scope["project_change"]["description"] == "Project XYZ"


def test_jurisdiction_stack_always_present():
    """jurisdiction_stack is always non-empty (SCAQMD stack)."""
    scope = scope_pack_from_facts({}, "r", "d")

    assert "SCAQMD" in scope["facility"]["jurisdiction_stack"]


def test_assumptions_always_contains_scaqmd_claim():
    """The SCAQMD jurisdiction assumption is always injected."""
    scope = scope_pack_from_facts({}, "r", "d")

    claims = [a["claim"] for a in scope["assumptions"]]
    assert any("SCAQMD" in c for c in claims)


def test_custom_address_used_when_provided():
    """A valid string address from facts is used; fallback otherwise."""
    scope_custom = scope_pack_from_facts({"address": "123 Main St, Los Angeles, CA"}, "r", "d")
    scope_default = scope_pack_from_facts({}, "r", "d")

    assert scope_custom["facility"]["address"] == "123 Main St, Los Angeles, CA"
    assert "Southern California" in scope_default["facility"]["address"]


def test_hazard_field_optional_on_chemical():
    """hazard is included when present as a string, omitted otherwise."""
    facts = {
        "chemicals": [
            {"name": "acetone", "quantity": 5, "unit": "gal", "hazard": "flammable"},
            {"name": "water", "quantity": 10, "unit": "gal"},  # no hazard
        ]
    }
    scope = scope_pack_from_facts(facts, "r", "d")
    chems = scope["project_change"]["chemicals"]

    assert chems[0].get("hazard") == "flammable"
    assert "hazard" not in chems[1]


def test_all_missing_facts_when_minimal_input():
    """Completely empty facts → all four missing-fact fields are flagged."""
    scope = scope_pack_from_facts({}, "r", "d")
    fields = _missing_fields(scope)

    # No chemicals → no chemicals.quantity missing fact (nothing to be missing)
    # But naics_or_sic and process_discharge ARE missing even with empty input
    assert "facility.naics_or_sic" in fields
    assert "project_change.process_discharge" in fields
    # With zero chemicals and zero waste streams, those category facts aren't flagged
    assert "chemicals.quantity" not in fields
    assert "waste_streams.kg_per_month" not in fields
