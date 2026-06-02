"""orchestrate AIQ function — the top-level workflow that threads run_id in Python.

This replaces a top-level `sequential_executor` because run_id cannot reliably
flow between steps via a contextvar: nat's runner + langgraph execute steps (and
the supervisor's tool nodes) in COPIED/FORKED contexts captured before any step
mutates the var, so a ContextVar.set() made inside `plan_candidates` is invisible
downstream. orchestrate fixes that by being a single coroutine that:

  1. runs plan_candidates and reads run_id straight from its JSON output;
  2. sets run_id IN ITS OWN context/process here — set_run_id (contextvar, best
     effort) AND set_active_run_id (process-global, the load-bearing carrier that
     survives langgraph's context fork) — BEFORE awaiting the supervisor, so the
     forked tool context inherits a process state that already carries run_id;
  3. runs the supervisor (tool_calling_agent) on the candidate summary; its tools
     (spawn_researchers, submit_plan) read run_id via get_active_run_id();
  4. runs finalize with run_id threaded EXPLICITLY as {"run_id": ...} — finalize
     never has to depend on the contextvar in the real flow.

Fail-loud: the plan -> supervise -> finalize CORE is never wrapped in a
result-fabricating try/except. A failure in any sub-step (LLM, Modal fan-out,
finalize pipeline) propagates. The ONLY guarded section is the post-run epilogue
(observability + always-on invariants) — supplementary telemetry that must NEVER
alter the returned determinations nor raise out of orchestrate. That single broad
except guards the epilogue exclusively; it does not creep over the core.
"""

import json
import logging
import os

from nat.builder.builder import Builder
from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig

from research_aiq.invariants import check_invariants
from research_aiq.observability import record_run
from research_aiq.run_store import STORE, set_active_run_id, set_run_id

logger = logging.getLogger("research_aiq.orchestrate")


class OrchestrateConfig(FunctionBaseConfig, name="orchestrate"):
    plan_function: str = "plan_candidates"
    supervisor_function: str = "supervisor"
    finalize_function: str = "finalize"


@register_function(config_type=OrchestrateConfig)
async def orchestrate(config: OrchestrateConfig, builder: Builder):
    plan = await builder.get_function(config.plan_function)
    supervisor = await builder.get_function(config.supervisor_function)
    finalize = await builder.get_function(config.finalize_function)

    async def _call(input_message: str) -> str:
        # 1. Deterministic planner: mints run_id, seeds the run-scoped STORE.
        plan_out = await plan.acall_invoke(input_message)
        plan_parsed = json.loads(plan_out)
        run_id = plan_parsed["run_id"]

        # 2. Bind run_id in THIS coroutine before the supervisor forks its tool
        #    context. set_active_run_id (process-global) is what actually reaches
        #    the tools; set_run_id (contextvar) is kept as a best-effort secondary.
        set_run_id(run_id)
        set_active_run_id(run_id)

        # 3. Agentic supervisor reviews the candidates and drives spawn/submit.
        #    Feed it the candidate summary string (what its system prompt expects).
        await supervisor.acall_invoke(plan_parsed["candidate_summary"])

        # 4. Deterministic backstop with run_id threaded explicitly.
        final = await finalize.acall_invoke(json.dumps({"run_id": run_id}))

        # --- always-on post-run observability + invariants -------------------
        # FAIL-SOFT epilogue ONLY. `final` is the product and is returned no
        # matter what happens below. This is the one place a broad `except` is
        # correct: it guards ONLY this telemetry/invariants block, never the
        # plan -> supervise -> finalize core above (which stays fail-loud). The
        # epilogue must never alter `final` and never raise out of orchestrate.
        try:
            parsed = json.loads(final)
            determinations = parsed.get("determinations", [])
            status = parsed.get("status")
            scope = STORE.scope(run_id)
            bundles = STORE.bundles(run_id)
            violations = check_invariants(
                {"scope": scope, "determinations": determinations, "status": status},
                bundles,
            )
            if violations:
                logger.warning(
                    "research_aiq invariant violations in run %s: %s", run_id, violations
                )
            metrics = {
                "status": status,
                "n_determinations": len(determinations),
                "n_verified": sum(1 for d in determinations if d.get("verified")),
                "n_needs_review": sum(
                    1 for d in determinations if d.get("applies") == "needs_review"
                ),
                "n_investigated": len(STORE.investigated_ids(run_id)),
                "n_invariant_violations": len(violations),
                "invariant_violations": violations,
                "model": os.environ.get("OPENAI_ORCHESTRATION_MODEL"),
            }
            record_run(run_id, metrics)
        except Exception:  # observability/invariants must never break a run
            logger.exception(
                "research_aiq post-run observability failed (non-fatal) for run %s", run_id
            )
        return final

    yield FunctionInfo.from_fn(
        _call,
        description=(
            "Run the full permit-applicability research pipeline for a scope: "
            "plan candidates, drive the agentic supervisor, then finalize (verify, "
            "repair, synthesize, recall floor). Input is a SCOPE JSON string; output "
            "is the determinations JSON."
        ),
    )
