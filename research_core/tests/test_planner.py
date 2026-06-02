"""
Python port of src/lib/research/__tests__/planner.test.ts.
"""

from __future__ import annotations


from research_core.planner import plan_research
from research_core.scope import scope_pack_from_facts


# ---------------------------------------------------------------------------
# researcher budget
# ---------------------------------------------------------------------------


def test_each_research_task_has_at_least_4_model_calls():
    """gives each research task at least 4 model calls for the agentic loop"""
    scope = {
        "run_id": "test_run",
        "facility": {"address": "X", "jurisdiction_stack": [], "naics": None, "sic": None},
        "project_change": {
            "description": "test project",
            "equipment": [{"kind": "coating_booth", "description": "booth"}],
            "chemicals": [
                {"name": "solvent", "quantity": 60, "unit": "gal", "hazard": "flammable"}
            ],
            "waste_streams": [],
            "disturbance_acres": None,
            "process_discharge": None,
        },
        "missing_facts": [],
        "assumptions": [],
    }
    plan = plan_research(scope)
    assert len(plan["research_tasks"]) > 0
    assert all(t["budget"]["max_model_calls"] >= 4 for t in plan["research_tasks"])


# ---------------------------------------------------------------------------
# planResearch — count varies with facts
# ---------------------------------------------------------------------------


def test_equipment_only_activates_air_not_hazmat_waste():
    """equipment-only project activates air but not hazmat/waste"""
    scope = scope_pack_from_facts(
        {"equipment": [{"kind": "oven"}], "naics": "323111"}, "r1", "two ovens"
    )
    plan = plan_research(scope)
    families = {h["family"] for h in plan["research_graph"]}
    assert "air" in families
    assert not any(h["id"] == "H-HAZMAT-HMBP" for h in plan["research_graph"])
    assert not any(h["id"] == "H-WASTE-GENERATOR" for h in plan["research_graph"])


def test_richer_project_spawns_more_hypotheses():
    """a richer project spawns strictly more hypotheses than the equipment-only one"""
    lean = plan_research(
        scope_pack_from_facts({"equipment": [{"kind": "oven"}], "naics": "323111"}, "r1", "ovens")
    )
    rich = plan_research(
        scope_pack_from_facts(
            {
                "equipment": [{"kind": "coating booth"}],
                "chemicals": [{"name": "solvent", "quantity": 60, "unit": "gallons"}],
                "waste_streams": [{"description": "spent solvent", "kg_per_month": 10}],
                "naics": "323111",
                "process_discharge": True,
            },
            "r2",
            "complex",
        )
    )
    assert len(rich["research_graph"]) > len(lean["research_graph"])
    assert any(h["id"] == "H-HAZMAT-HMBP" for h in rich["research_graph"])
