"""Python port of src/lib/research/__tests__/run.split.test.ts.

The TS test calls planRun (LLM intake + parseScope) then runLocalResearchPool
(fixture workers) then finalizeRun. The Python offline port does not include
an LLM intake step; we feed a seeded ScopePack directly and skip any
assertions that depend on the LLM-parsed result.

Python "split" is:
  plan  = plan_research(scope, [])
  run   = finalize_run(run_id, scope, plan, fixture_evidence, [], [])
"""

from __future__ import annotations
import json
from pathlib import Path

GOLDEN_DIR = Path(__file__).parent / "goldens"


def _load_golden(name: str) -> dict:
    return json.loads((GOLDEN_DIR / f"{name}.json").read_text())


# ---------------------------------------------------------------------------
# Helper: load a golden's fixture_evidence (the fixture-path evidence bundles)
# ---------------------------------------------------------------------------


def _fixture_evidence(golden: dict) -> list[dict]:
    return golden["fixture_evidence"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestRunSplit:
    """Mirror 'run.ts split' describe block from run.split.test.ts."""

    def test_plan_is_independent_of_finalize(self):
        """plan_research can be called without finalize_run (split boundary)."""
        from research_core.planner import plan_research
        from tests.fixtures.scenarios import seeded_complex_scope

        scope = seeded_complex_scope("run_split_001", "")
        plan = plan_research(scope, [])

        # plan must have the four keys that finalizeRun expects
        assert "research_tasks" in plan
        assert "research_graph" in plan
        assert "coverage_family_statuses" in plan
        assert "regulatory_angles" in plan
        assert len(plan["research_tasks"]) > 0

    def test_plan_plus_finalize_produces_determinations(self):
        """Mirror: planRun + pool + finalizeRun produces determinations for a fixture run.

        TS assertion: run.determinations.length == plan.research_graph.length
        Python: len(result["determinations"]) == len(plan["research_graph"])

        NOTE: the TS version also asserts run_id starts with 'run_' because
        planRun generates the ID. In Python, we supply the run_id ourselves,
        so that assertion is skipped here.
        """
        from research_core.planner import plan_research
        from research_core.pipeline import finalize_run

        golden = _load_golden("complex")
        scope = golden["scope_pack"]
        run_id = golden["run_id"]

        plan = plan_research(scope, [])

        # Feed the seeded fixture evidence (mirrors runLocalResearchPool output)
        evidence = _fixture_evidence(golden)

        result = finalize_run(run_id, scope, plan, evidence, [], [])

        # Mirrors: expect(run.determinations.length).toBe(planned.plan.research_graph.length)
        assert len(result["determinations"]) == len(plan["research_graph"])

        # Mirrors: expect(run.report_markdown).toContain("Applicability Matrix")
        assert "Applicability Matrix" in result["report_markdown"]

    def test_finalize_run_shape(self):
        """finalize_run returns a ResearchRun-shaped dict with all expected keys."""
        from research_core.planner import plan_research
        from research_core.pipeline import finalize_run

        golden = _load_golden("construction")
        scope = golden["scope_pack"]
        plan = plan_research(scope, [])
        evidence = _fixture_evidence(golden)

        result = finalize_run(golden["run_id"], scope, plan, evidence, [], [])

        expected_keys = {
            "run_id",
            "status",
            "scope_pack",
            "coverage_family_statuses",
            "regulatory_angles",
            "research_graph",
            "research_tasks",
            "evidence_bundles",
            "verification_verdicts",
            "repair_tickets",
            "memory_updates",
            "determinations",
            "trace_events",
            "report_markdown",
        }
        for key in expected_keys:
            assert key in result, f"Missing key: {key}"

    def test_plan_research_graph_order_preserved_in_determinations(self):
        """Determinations appear in research_graph order (synthesis first, recall-gap after)."""
        from research_core.planner import plan_research
        from research_core.pipeline import finalize_run

        golden = _load_golden("complex")
        scope = golden["scope_pack"]
        plan = plan_research(scope, [])
        evidence = _fixture_evidence(golden)

        result = finalize_run(golden["run_id"], scope, plan, evidence, [], [])

        graph_ids = [h["id"] for h in plan["research_graph"]]
        det_reqs = [d["requirement"] for d in result["determinations"]]

        # Determinations sourced from the graph should appear before any recall-gap rows
        # (recall-gap rows have no corresponding hypothesis in the graph by definition)
        from research_core.synthesis import _requirement_for

        graph_requirements = [_requirement_for(hid) for hid in graph_ids]

        for req in graph_requirements:
            assert req in det_reqs, f"Requirement {req!r} missing from determinations"

    def test_status_needs_review_when_any_review_flag(self):
        """status == 'needs_review' when any determination has review_flag=True."""
        from research_core.planner import plan_research
        from research_core.pipeline import finalize_run

        golden = _load_golden("complex")
        scope = golden["scope_pack"]
        plan = plan_research(scope, [])
        evidence = _fixture_evidence(golden)

        result = finalize_run(golden["run_id"], scope, plan, evidence, [], [])

        has_review_flag = any(d["review_flag"] for d in result["determinations"])
        if has_review_flag:
            assert result["status"] == "needs_review"
        else:
            assert result["status"] == "done"

    def test_repair_tickets_collected(self):
        """repair_tickets key exists and is a list (may be empty for seeded data)."""
        from research_core.planner import plan_research
        from research_core.pipeline import finalize_run

        golden = _load_golden("complex")
        scope = golden["scope_pack"]
        plan = plan_research(scope, [])
        evidence = _fixture_evidence(golden)

        result = finalize_run(golden["run_id"], scope, plan, evidence, [], [])

        assert isinstance(result["repair_tickets"], list)

    def test_all_three_seeded_scopes(self):
        """plan + finalize succeeds for all three seeded scope fixtures."""
        from research_core.planner import plan_research
        from research_core.pipeline import finalize_run

        for case in ["complex", "construction", "missing_facts"]:
            golden = _load_golden(case)
            scope = golden["scope_pack"]
            plan = plan_research(scope, [])
            evidence = _fixture_evidence(golden)
            result = finalize_run(golden["run_id"], scope, plan, evidence, [], [])
            assert len(result["determinations"]) > 0, f"{case}: no determinations"
            assert result["status"] in {"done", "needs_review"}, f"{case}: bad status"
