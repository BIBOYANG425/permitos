"""
Python port of src/lib/research/__tests__/toolCatalog.test.ts.
"""
from __future__ import annotations

import pytest

from research_core.tool_catalog import (
    HARNESS_TOOL_CATALOG,
    is_tool_scoped_to_role,
    research_worker_tool_ids,
    subagent_control_tool_ids,
    tool_ids_for_role,
    universal_harness_tool_ids,
)
from research_core.planner import plan_research
from tests.fixtures.scenarios import seeded_complex_scope


# ---------------------------------------------------------------------------
# harness tool catalog
# ---------------------------------------------------------------------------

def test_tool_ids_unique():
    """keeps tool ids unique"""
    ids = [tool["id"] for tool in HARNESS_TOOL_CATALOG]
    assert len(set(ids)) == len(ids)


def test_includes_universal_and_subagent_control_primitives():
    """includes the universal harness and subagent control primitives"""
    for expected in ["log_step", "emit_trace_event", "validate_artifact_schema", "send_message", "escalate_to_human"]:
        assert expected in universal_harness_tool_ids

    for expected in ["spawn_subagents", "send_subagent_message", "wait_for_subagents", "cancel_subagent"]:
        assert expected in subagent_control_tool_ids


def test_researcher_workers_scoped_to_safe_retrieval_tools():
    """scopes researcher workers to safe retrieval tools plus universal harness tools"""
    researcher_tools = tool_ids_for_role("researcher")
    worker_tools = research_worker_tool_ids()

    for expected in [
        "get_source_pointers",
        "fetch_source",
        "prove_currency",
        "extract_threshold",
        "evaluate_predicate",
        "quarantine_injection",
        "log_step",
        "send_message",
    ]:
        assert expected in worker_tools

    assert all(tool_id in researcher_tools for tool_id in worker_tools)
    assert "get_form" not in worker_tools
    assert "build_applicability_matrix" not in worker_tools


def test_rejects_tools_outside_role_scope():
    """rejects tools outside a role scope"""
    assert is_tool_scoped_to_role("fetch_source", "researcher") is True
    assert is_tool_scoped_to_role("fetch_source", "synthesizer") is False
    assert is_tool_scoped_to_role("send_message", "synthesizer") is True
    assert is_tool_scoped_to_role("spawn_subagents", "researcher") is False


def test_separates_claim_set_and_process_verification_tools():
    """separates claim, set, and process verification tools"""
    verifier_tools = tool_ids_for_role("verifier")

    for expected in [
        "verify_determination",
        "self_consistency",
        "verify_determination_set",
        "verify_process_trace",
        "run_eval_set",
    ]:
        assert expected in verifier_tools

    assert is_tool_scoped_to_role("verify_determination_set", "researcher") is False
    assert is_tool_scoped_to_role("verify_process_trace", "system") is True


def test_plans_research_tasks_with_cataloged_tool_ids():
    """plans research tasks with cataloged tool ids"""
    catalog_ids = {tool["id"] for tool in HARNESS_TOOL_CATALOG}
    plan = plan_research(seeded_complex_scope("run_tools", "demo"))

    assert len(plan["research_tasks"]) >= 5
    for task in plan["research_tasks"]:
        assert len(task["allowed_tools"]) > 0
        assert all(tool_id in catalog_ids for tool_id in task["allowed_tools"])
        for uid in universal_harness_tool_ids:
            assert uid in task["allowed_tools"]
        assert all(tool_id in catalog_ids for tool_id in task["blocked_tools"])
        assert "get_form" in task["blocked_tools"]
