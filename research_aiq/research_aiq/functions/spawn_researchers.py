"""spawn_researchers AIQ function — fans research subagents out to Modal.

The supervisor LLM calls this with a batch of candidate hypothesis ids. The tool
validates the ids against the run's candidate set, drops ids already investigated
(dedupe), looks up each accepted id's research_task (the Modal task_spec) from the
run store, fans those task_specs out to research subagents on Modal, writes the
full returned bundles into the run-scoped STORE, and returns a DISTILLED summary
(conclusion + grounding flag per hypothesis) to the LLM. The full bundles stay in
the store for finalize to consume.

Modal contract: the worker's `research` endpoint takes ONE task_spec per POST,
authenticates via a `token` field in the request BODY, and returns a SINGLE
EvidenceBundle dict. _modal_fanout therefore POSTs one request per accepted id
(concurrently) rather than a single batch call.

Fail-loud: if the Modal fan-out raises, the exception PROPAGATES. A worker that
rejects the token answers {"error": "unauthorized"} with HTTP 200, so _modal_fanout
also raises when a response carries no bundle. There is no silent deterministic
fallback and no swallowing of fan-out failures. The fan-out is injected as `fanout`
so tests can substitute a fake (no network in tests); the fake receives the same
task_spec list the real fan-out would.
"""

import json
import os

from nat.builder.builder import Builder
from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig

from research_aiq.run_store import STORE, current_run_id


class SpawnResearchersConfig(FunctionBaseConfig, name="spawn_researchers"):
    modal_endpoint_env: str = "MODAL_RESEARCH_ENDPOINT"


async def _modal_fanout(task_specs: list[dict]) -> list[dict]:
    """Fan the given research task_specs out to the Modal `research` endpoint.

    Contract (see src/lib/research/modal/worker.py `research`): the endpoint takes
    ONE task_spec per POST, authenticates via a `token` field in the BODY (not a
    Bearer header), and returns a SINGLE EvidenceBundle dict. We POST one request
    per task_spec concurrently and collect the bundles. A worker that rejects the
    token returns {"error": "unauthorized"} with HTTP 200, so we surface any bundle
    that is missing hypothesis_id as a fail-loud RuntimeError rather than letting a
    KeyError leak downstream.
    """
    import asyncio

    import httpx

    endpoint = os.environ.get("MODAL_RESEARCH_ENDPOINT")
    token = os.environ.get("MODAL_RESEARCH_TOKEN")
    if not endpoint:
        raise RuntimeError(
            "spawn_researchers requires MODAL_RESEARCH_ENDPOINT (fail-loud, no fallback)"
        )

    async with httpx.AsyncClient(timeout=600) as client:

        async def _one(task_spec: dict) -> dict:
            resp = await client.post(endpoint, json={"token": token, "task_spec": task_spec})
            resp.raise_for_status()
            bundle = resp.json()
            if not isinstance(bundle, dict) or "hypothesis_id" not in bundle:
                raise RuntimeError(
                    f"Modal research endpoint returned no bundle (response={bundle!r}); "
                    "check MODAL_RESEARCH_TOKEN / endpoint (fail-loud, no fallback)"
                )
            return bundle

        return await asyncio.gather(*(_one(spec) for spec in task_specs))


async def _spawn_impl(input_message: str, *, fanout=_modal_fanout, run_id: str | None = None) -> str:
    # Param name MUST be `input_message`: nat's LangChain tool wrapper
    # (nat/plugins/langchain/tool_wrapper.py) only auto-wraps a bare-string tool
    # call into the function's schema when the schema field is named `input_message`.
    # With any other name the agent emits a mismatched envelope (e.g. {"value": ...})
    # and input coercion crashes. The supervisor calls this as a tool, so the bundled
    # JSON batch {"hypothesis_ids": [...]} arrives here as this string.
    run_id = run_id or current_run_id()
    args = json.loads(input_message)
    requested = [str(x) for x in args.get("hypothesis_ids", [])]
    valid = {c["id"] for c in STORE.candidates(run_id)}
    already = set(STORE.investigated_ids(run_id))
    accepted = [i for i in requested if i in valid and i not in already]
    rejected = [i for i in requested if i not in valid]
    if not accepted:
        return json.dumps({"investigated": [], "rejected": rejected, "note": "no new valid ids"})
    # The Modal worker consumes the planner's per-hypothesis task_spec (id +
    # allowed_tools + budget), not a bare id list. Look each up from the run store.
    task_specs = [STORE.task_for(run_id, i) for i in accepted]
    bundles = await fanout(task_specs)  # fail-loud: exceptions propagate
    STORE.add_bundles(run_id, bundles)
    investigated = [
        {
            "hypothesis_id": b["hypothesis_id"],
            "conclusion": b.get("researcher_conclusion", "needs_review"),
            "grounded": len(b.get("sources", [])) > 0,
        }
        for b in bundles
    ]
    return json.dumps({"investigated": investigated, "rejected": rejected})


@register_function(config_type=SpawnResearchersConfig)
async def spawn_researchers(config: SpawnResearchersConfig, builder: Builder):
    # Register a closure with a CLEAN single `input_message: str` signature. The
    # keyword-only test seams (fanout, run_id) stay on _spawn_impl, but if they were
    # exposed to FunctionInfo.from_fn it would fall back to a generic `value`-named
    # schema instead of `input_message` — the LangChain agent would then emit
    # {"value": ...} and input coercion would crash. Tests call _spawn_impl directly.
    async def _call(input_message: str) -> str:
        return await _spawn_impl(input_message)

    yield FunctionInfo.from_fn(
        _call,
        description=(
            "Spawn bounded research subagents (on Modal) for the given candidate hypothesis ids. "
            "Returns each researcher's distilled conclusion + grounding flag. Call once per batch; "
            "callable repeatedly."
        ),
    )
