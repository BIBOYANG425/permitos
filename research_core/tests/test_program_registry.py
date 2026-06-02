"""
Faithful Python port of src/lib/research/__tests__/programRegistry.test.ts.

Every `it(...)` case from the TS suite is ported to a pytest `def test_...`.
The planner-dependent case is skipped until research_core.planner is ported
(Task 8), exactly mirroring the pattern in test_parity.py.
"""

from __future__ import annotations

import pytest

from research_core.program_registry import PROGRAM_REGISTRY, all_programs, programs_for_family


# ---------------------------------------------------------------------------
# Fixture: maximalScope — mirrors the TS `maximalScope` constant verbatim.
# ---------------------------------------------------------------------------

MAXIMAL_SCOPE = {
    "run_id": "t",
    "facility": {
        "address": "x",
        "jurisdiction_stack": ["SCAQMD"],
        "naics": "332999",
        "sic": "3499",
    },
    "project_change": {
        "description": "test",
        "equipment": [{"kind": "coating_booth", "description": ""}],
        "chemicals": [{"name": "solvent", "quantity": 60, "unit": "gal"}],
        "waste_streams": [{"description": "spent solvent", "kg_per_month": 50}],
        "disturbance_acres": 2,
        "process_discharge": True,
    },
    "missing_facts": [],
    "assumptions": [],
}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_has_unique_id_per_entry():
    """it('has a unique id per entry') — every registry id must be distinct."""
    ids = [p["id"] for p in PROGRAM_REGISTRY]
    assert len(set(ids)) == len(ids)


@pytest.mark.skip(reason="planner not ported yet (Task 8)")
def test_covers_every_hypothesis_the_planner_can_emit():
    """it('covers every hypothesis the planner can emit') — requires plan_research."""
    from research_core.planner import plan_research  # noqa: PLC0415

    emitted = {h["id"] for h in plan_research(MAXIMAL_SCOPE)["research_graph"]}
    covered = {hid for p in PROGRAM_REGISTRY for hid in p["hypothesis_ids"]}
    uncovered = [h for h in emitted if h not in covered]
    assert uncovered == []


def test_programs_for_family_filters_by_family():
    """it('programsForFamily filters by family')."""
    air_programs = programs_for_family("air")
    assert len(air_programs) > 0
    assert all(p["family"] == "air" for p in air_programs)


def test_all_programs_returns_the_full_registry():
    """it('allPrograms returns the full registry')."""
    assert len(all_programs()) == len(PROGRAM_REGISTRY)
