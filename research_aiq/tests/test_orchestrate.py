"""orchestrate top-level function — threads run_id in Python across the three steps.

The live e2e is the real proof orchestrate works end to end; this unit test pins the
load-bearing wiring WITHOUT AIQ/langgraph machinery: with the three sub-functions
faked, assert orchestrate (a) feeds plan's candidate_summary to the supervisor,
(b) sets the process-global run_id (the carrier that survives langgraph's context
fork), and (c) calls finalize with run_id threaded EXPLICITLY as {"run_id": ...}
rather than relying on any contextvar.
"""

from __future__ import annotations

import asyncio
import json

from research_aiq.functions.orchestrate import OrchestrateConfig, orchestrate
from research_aiq.run_store import get_active_run_id, set_active_run_id


class _FakeFn:
    """Minimal stand-in for a nat Function: records the input it was acall_invoke'd with."""

    def __init__(self, result: str):
        self._result = result
        self.calls: list[str] = []

    async def acall_invoke(self, value: str) -> str:
        self.calls.append(value)
        return self._result


class _FakeBuilder:
    def __init__(self, fns: dict[str, _FakeFn]):
        self._fns = fns

    async def get_function(self, name: str) -> _FakeFn:
        return self._fns[name]


async def _drive(builder: _FakeBuilder, scope_json: str) -> str:
    # @register_function turns the setup generator into an async context manager that
    # yields the FunctionInfo; enter it and call the registered single fn.
    async with orchestrate(OrchestrateConfig(), builder) as info:  # type: ignore[arg-type]
        return await info.single_fn(scope_json)


def test_orchestrate_threads_run_id_plan_to_finalize():
    set_active_run_id(None)  # clean slate

    plan = _FakeFn(json.dumps({"run_id": "run-ORCH", "candidate_summary": "- H-AIR-201 [air] q?"}))
    supervisor = _FakeFn("freeform supervisor wrap-up text")
    finalize = _FakeFn(json.dumps({"run_id": "run-ORCH", "determinations": [], "status": "needs_review"}))

    builder = _FakeBuilder({"plan_candidates": plan, "supervisor": supervisor, "finalize": finalize})

    out = asyncio.run(_drive(builder, '{"facility": {}, "project_change": {}}'))

    # plan got the raw scope input
    assert plan.calls == ['{"facility": {}, "project_change": {}}']
    # supervisor was fed the candidate_summary string (what its system prompt expects),
    # NOT the whole plan JSON.
    assert supervisor.calls == ["- H-AIR-201 [air] q?"]
    # finalize was called with run_id threaded EXPLICITLY (no contextvar reliance).
    assert finalize.calls == [json.dumps({"run_id": "run-ORCH"})]
    # the process-global carrier was set to the minted run_id.
    assert get_active_run_id() == "run-ORCH"
    # orchestrate returns finalize's output verbatim.
    assert json.loads(out)["status"] == "needs_review"


def test_orchestrate_is_fail_loud_when_a_step_raises():
    """orchestrate must not swallow a sub-step failure into a fabricated result."""
    import pytest

    set_active_run_id(None)
    plan = _FakeFn(json.dumps({"run_id": "run-ERR", "candidate_summary": "x"}))

    class _Boom(_FakeFn):
        async def acall_invoke(self, value: str) -> str:
            raise RuntimeError("supervisor blew up")

    builder = _FakeBuilder(
        {"plan_candidates": plan, "supervisor": _Boom("unused"), "finalize": _FakeFn("unused")}
    )

    with pytest.raises(RuntimeError, match="supervisor blew up"):
        asyncio.run(_drive(builder, "{}"))
