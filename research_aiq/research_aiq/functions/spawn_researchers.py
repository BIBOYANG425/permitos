"""spawn_researchers AIQ function — fans research subagents out to Modal.

The supervisor LLM calls this with a batch of candidate hypothesis ids. The tool
validates the ids against the run's candidate set, drops ids already investigated
(dedupe), fans the remaining ids out to research subagents on Modal (an HTTP POST
to MODAL_RESEARCH_ENDPOINT), writes the full returned bundles into the run-scoped
STORE, and returns a DISTILLED summary (conclusion + grounding flag per hypothesis)
to the LLM. The full bundles stay in the store for finalize to consume.

Fail-loud: if the Modal fan-out raises, the exception PROPAGATES. There is no
silent deterministic fallback and no swallowing of fan-out failures. The fan-out
is injected as `fanout` so tests can substitute a fake (no network in tests).
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


async def _modal_fanout(ids: list[str]) -> list[dict]:
    import httpx

    endpoint = os.environ.get("MODAL_RESEARCH_ENDPOINT")
    token = os.environ.get("MODAL_RESEARCH_TOKEN")
    if not endpoint:
        raise RuntimeError(
            "spawn_researchers requires MODAL_RESEARCH_ENDPOINT (fail-loud, no fallback)"
        )
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            endpoint,
            json={"hypothesis_ids": ids},
            headers={"Authorization": f"Bearer {token}"} if token else {},
        )
        resp.raise_for_status()
        return resp.json()["bundles"]


async def _spawn_impl(args_json: str, *, fanout=_modal_fanout, run_id: str | None = None) -> str:
    run_id = run_id or current_run_id()
    args = json.loads(args_json)
    requested = [str(x) for x in args.get("hypothesis_ids", [])]
    valid = {c["id"] for c in STORE.candidates(run_id)}
    already = set(STORE.investigated_ids(run_id))
    accepted = [i for i in requested if i in valid and i not in already]
    rejected = [i for i in requested if i not in valid]
    if not accepted:
        return json.dumps({"investigated": [], "rejected": rejected, "note": "no new valid ids"})
    bundles = await fanout(accepted)  # fail-loud: exceptions propagate
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
    yield FunctionInfo.from_fn(
        _spawn_impl,
        description=(
            "Spawn bounded research subagents (on Modal) for the given candidate hypothesis ids. "
            "Returns each researcher's distilled conclusion + grounding flag. Call once per batch; "
            "callable repeatedly."
        ),
    )
