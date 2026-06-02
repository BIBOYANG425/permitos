"""submit_plan AIQ function — terminal marker the supervisor calls once it has
spawned every hypothesis it intends to investigate.

The set of investigated hypotheses lives in the run-scoped STORE (written by
spawn_researchers), not in this call. submit_plan only records the supervisor's
pruning rationale as an audit note and signals completion.
"""

import json

from nat.builder.builder import Builder
from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig

from research_aiq.run_store import STORE, current_run_id, get_active_run_id


class SubmitPlanConfig(FunctionBaseConfig, name="submit_plan"):
    pass


async def _submit_impl(input_message: str, *, run_id: str | None = None) -> str:
    # Param name MUST be `input_message` so nat's LangChain tool wrapper auto-wraps
    # the supervisor's bare-string tool call ({"rationale": "..."}) into this schema.
    # See spawn_researchers._spawn_impl for the full rationale (incl. why the
    # process-global, not the contextvar, is what reaches this tool under langgraph).
    run_id = run_id or current_run_id() or get_active_run_id()
    rationale = json.loads(input_message).get("rationale", "")
    if run_id is not None:
        STORE.add_note(run_id, rationale)
    return json.dumps({"ok": True, "rationale": rationale})


@register_function(config_type=SubmitPlanConfig)
async def submit_plan(config: SubmitPlanConfig, builder: Builder):
    # Clean single-`input_message` closure so FunctionInfo.from_fn advertises an
    # `input_message` schema (not the generic `value` fallback that the keyword-only
    # run_id seam would force). See spawn_researchers.spawn_researchers for details.
    async def _call(input_message: str) -> str:
        return await _submit_impl(input_message)

    yield FunctionInfo.from_fn(
        _call,
        description=(
            "Finish orchestration once every hypothesis you intend to investigate has been "
            "spawned. Provide a short rationale for what you pruned and why. The set of "
            "investigated hypotheses is tracked automatically; this call only signals completion."
        ),
    )
