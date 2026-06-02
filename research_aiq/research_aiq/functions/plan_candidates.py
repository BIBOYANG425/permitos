"""plan_candidates AIQ function — runs the deterministic research_core planner.

Wraps research_core.planner.plan_research: parses the scope JSON, generates the
candidate hypotheses (the planner's research_graph), seeds the run-scoped STORE
with scope + candidates, binds the run_id to the contextvar, and returns a
compact summary the supervisor can read.
"""

import json
import uuid

from nat.builder.builder import Builder
from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig
from research_core.planner import plan_research

from research_aiq.run_store import STORE, set_run_id


class PlanCandidatesConfig(FunctionBaseConfig, name="plan_candidates"):
    pass


async def _plan_candidates_impl(input_message: str) -> str:
    # Param name MUST be `input_message`: the sequential_executor passes the bare
    # `--input` string to this first step via the LangChain tool wrapper, which only
    # round-trips a bare string when the function's schema field is `input_message`.
    # The scope JSON arrives here as this string.
    scope = json.loads(input_message)
    run_id = scope.get("run_id") or f"run-{uuid.uuid4().hex[:8]}"
    scope["run_id"] = run_id
    plan = plan_research(scope, [])
    candidates = plan["research_graph"]
    # Seed both the candidate hypotheses (what the supervisor reviews) and the
    # research_tasks (the per-hypothesis Modal task_spec spawn_researchers forwards).
    STORE.init(
        run_id, scope=scope, candidates=candidates, tasks=plan.get("research_tasks", [])
    )
    set_run_id(run_id)
    summary = "\n".join(
        f"- {h['id']} [{h['family']}] {h['question']}" for h in candidates
    )
    return json.dumps({"run_id": run_id, "candidate_summary": summary})


@register_function(config_type=PlanCandidatesConfig)
async def plan_candidates(config: PlanCandidatesConfig, builder: Builder):
    yield FunctionInfo.from_fn(
        _plan_candidates_impl,
        description="Run the deterministic planner; returns the candidate hypotheses for this scope.",
    )
