"""finalize AIQ function — the deterministic, un-bypassable backstop.

Runs AFTER the agentic supervisor. The supervisor chooses WHICH candidate
hypotheses to investigate and may prune some; finalize re-runs research_core's
verify -> repair -> synthesize -> recall-floor over whatever evidence was actually
gathered. The recall floor re-derives the EXPECTED program set from the registry x
scope and surfaces any expected program whose hypothesis was never investigated as
a needs_review determination — so the model cannot make an expected program
silently disappear.

Mechanism: research_core.finalize_run derives the investigated-hypothesis set from
plan["research_graph"]. We therefore prune the deterministic plan down to only the
hypotheses that were actually investigated (STORE.investigated_ids, i.e. the
hypotheses for which spawn_researchers wrote bundles). Pruning a hypothesis whose
program is still expected for the scope is exactly what trips the recall floor.

Fail-loud: the STORE reads raise KeyError for an unknown run and finalize_run
propagates any pipeline error. Neither is wrapped in a try/except that fabricates
a result — a fabricated "done" here would defeat the entire backstop guarantee.
"""

import json

from nat.builder.builder import Builder
from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig
from research_core.pipeline import finalize_run
from research_core.planner import plan_research

from research_aiq.run_store import STORE


class FinalizeConfig(FunctionBaseConfig, name="finalize"):
    pass


def _prune(plan: dict, investigated_ids: list[str]) -> dict:
    """Restrict the deterministic plan to the hypotheses that were investigated.

    finalize_run reads the investigated set from research_graph, so dropping an
    uninvestigated hypothesis here is what surfaces its (still-expected) program
    via the recall floor. research_tasks are pruned in lockstep for consistency.
    """
    keep = set(investigated_ids)
    return {
        **plan,
        "research_graph": [h for h in plan["research_graph"] if h["id"] in keep],
        "research_tasks": [t for t in plan["research_tasks"] if t["hypothesis_id"] in keep],
    }


async def _finalize_impl(args_json: str) -> str:
    run_id = json.loads(args_json)["run_id"]
    scope = STORE.scope(run_id)  # raises KeyError for an unknown run -> fail-loud
    bundles = STORE.bundles(run_id)
    plan = plan_research(scope, [])
    pruned = _prune(plan, STORE.investigated_ids(run_id))
    # finalize_run(run_id, scope, plan, evidence, base_trace, sds_reviews):
    # base_trace seeds the trace event list (empty here); sds_reviews is the SDS
    # review list (none in the agentic tier).
    result = finalize_run(run_id, scope, pruned, bundles, [], [])
    return json.dumps(
        {
            "run_id": run_id,
            "determinations": result["determinations"],
            "status": result["status"],
        }
    )


@register_function(config_type=FinalizeConfig)
async def finalize(config: FinalizeConfig, builder: Builder):
    yield FunctionInfo.from_fn(
        _finalize_impl,
        description=(
            "Verify, repair, synthesize, and apply the recall floor over the gathered "
            "evidence to produce the final determinations. Deterministic backstop — call "
            "exactly once, after all research is done."
        ),
    )
