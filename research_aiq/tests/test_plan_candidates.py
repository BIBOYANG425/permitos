import asyncio
import json

from research_aiq.functions.plan_candidates import _plan_candidates_impl
from research_aiq.run_store import STORE


def test_plan_candidates_seeds_store_and_returns_summary():
    scope = {
        "run_id": "seed",
        "facility": {"jurisdiction_stack": ["SCAQMD"], "naics": None, "sic": None},
        "project_change": {
            "description": "coating booth",
            "equipment": [{"kind": "coating_booth", "description": ""}],
            "chemicals": [{"name": "solvent", "quantity": 60, "unit": "gal"}],
            "waste_streams": [],
            "disturbance_acres": None,
            "process_discharge": False,
        },
        "missing_facts": [],
        "assumptions": [],
    }
    out = asyncio.run(_plan_candidates_impl(json.dumps(scope)))
    parsed = json.loads(out)
    run_id = parsed["run_id"]
    assert parsed["candidate_summary"]  # non-empty summary string
    assert len(STORE.candidates(run_id)) > 0  # candidates seeded
    assert STORE.scope(run_id)["facility"]["jurisdiction_stack"] == ["SCAQMD"]
