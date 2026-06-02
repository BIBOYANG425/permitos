"""Faithful Python port of src/lib/research/__tests__/run.recallFloor.test.ts.

The recall floor wired into finalize_run. A per-hypothesis verifier only sees the
proposed set, so it is blind to a wholly-missed family. finalize_run re-derives the
EXPECTED program set from the registry x scope and surfaces any program that was
never investigated as a needs_review determination row.

Built deterministically (no LLM): the scope is constructed directly and the plan
comes from the synchronous plan_research, so the test is independent of intake parsing.
"""

from __future__ import annotations

from research_core.planner import plan_research
from research_core.pipeline import finalize_run


def _scope_with(**overrides) -> dict:
    """Mirror the scopeWith() helper from the TS test file."""
    project_change = {
        "description": "coating booth + flammable solvent",
        "equipment": [{"kind": "coating_booth", "description": ""}],
        "chemicals": [{"name": "solvent", "quantity": 60, "unit": "gal"}],
        "waste_streams": [],
        "disturbance_acres": None,
        "process_discharge": False,
    }
    project_change.update(overrides)
    return {
        "run_id": "recall-test",
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


class TestRunRecallFloorWiring:
    def test_surfaces_expected_but_uninvestigated_program_as_needs_review(self):
        """surfaces an expected-but-uninvestigated program as a needs_review determination"""
        # equipment + chemicals -> air programs + ca-hmbp are expected for this scope.
        scope = _scope_with()
        plan = plan_research(scope)
        # Simulate an orchestrator that dropped the hazmat family entirely:
        # strip the HMBP hypothesis from the proposed research graph.
        gapped_plan = {
            **plan,
            "research_graph": [
                h for h in plan["research_graph"] if h["id"] != "H-HAZMAT-HMBP"
            ],
        }

        # Evidence is irrelevant to the recall floor; pass none.
        run = finalize_run("recall-test", scope, gapped_plan, [], [])

        hmbp_row = next(
            (d for d in run["determinations"]
             if d["requirement"] == "California Hazardous Materials Business Plan (HMBP)"),
            None,
        )
        assert hmbp_row is not None, "recall floor should add a row for the missed ca-hmbp program"
        assert hmbp_row["applies"] == "needs_review"
        assert hmbp_row["review_flag"] is True
        assert run["status"] == "needs_review"

        # The gap is also visible in the trace for the demo.
        assert any(
            e["phase"] == "recall_floor" and e["artifact_id"] == "ca-hmbp"
            for e in run["trace_events"]
        )

    def test_adds_no_recall_gap_rows_when_plan_covers_every_expected_program(self):
        """adds no recall-gap rows when the plan covers every expected program"""
        scope = _scope_with()
        plan = plan_research(scope)
        run = finalize_run("recall-test", scope, plan, [], [])

        # The real planner always proposes a superset of the registry's expected set,
        # so the recall floor is a no-op: one determination per investigated hypothesis.
        assert len(run["determinations"]) == len(plan["research_graph"])
        assert not any(e["phase"] == "recall_floor" for e in run["trace_events"])
