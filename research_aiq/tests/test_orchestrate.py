"""orchestrate top-level function — threads run_id in Python across the three steps.

The live e2e is the real proof orchestrate works end to end; this unit test pins the
load-bearing wiring WITHOUT AIQ/langgraph machinery: with the three sub-functions
faked, assert orchestrate (a) feeds plan's candidate_summary to the supervisor,
(b) sets the process-global run_id (the carrier that survives langgraph's context
fork), (c) calls finalize with run_id threaded EXPLICITLY as {"run_id": ...} rather
than relying on any contextvar, and (d) runs the always-on post-run epilogue
(record_run + check_invariants) FAIL-SOFT: it records the run once with the run_id
and metrics, but never alters the determinations orchestrate returns and never
raises out of orchestrate even when the epilogue itself errors.
"""

from __future__ import annotations

import asyncio
import json

import research_aiq.functions.orchestrate as orchestrate_mod
from research_aiq.functions.orchestrate import OrchestrateConfig, orchestrate
from research_aiq.invariants import check_invariants
from research_aiq.run_store import STORE, get_active_run_id, set_active_run_id


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


def test_orchestrate_threads_run_id_plan_to_finalize(monkeypatch):
    set_active_run_id(None)  # clean slate

    plan = _FakeFn(json.dumps({"run_id": "run-ORCH", "candidate_summary": "- H-AIR-201 [air] q?"}))
    supervisor = _FakeFn("freeform supervisor wrap-up text")
    determinations = [
        {"requirement": "R1", "applies": "yes", "verified": True},
        {"requirement": "R2", "applies": "needs_review", "verified": False},
    ]
    finalize = _FakeFn(
        json.dumps({"run_id": "run-ORCH", "determinations": determinations, "status": "needs_review"})
    )

    builder = _FakeBuilder({"plan_candidates": plan, "supervisor": supervisor, "finalize": finalize})

    # Seed STORE.scope so the always-on post-run epilogue runs to completion rather
    # than short-circuiting in its fail-soft guard. The exact violation count is not
    # the subject here (the fake R1/R2 rows are decoupled from the registry, so this
    # scope's baseline expected programs do register recall-floor violations); what
    # we pin is that the metric MIRRORS the epilogue's own check_invariants result on
    # the same inputs (asserted below) — i.e. the invariant outcome is wired into the
    # recorded metric, not hardcoded.
    STORE.init("run-ORCH", scope={}, candidates=[])

    # Capture record_run instead of POSTing to Raindrop. Asserting on the captured
    # args proves orchestrate records the run exactly once with the run_id + metrics.
    recorded: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        orchestrate_mod, "record_run", lambda run_id, metrics: recorded.append((run_id, metrics))
    )

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
    # orchestrate returns finalize's output UNCHANGED — the epilogue never alters it.
    assert out == finalize._result
    assert json.loads(out)["status"] == "needs_review"

    # the always-on epilogue recorded the run exactly once, keyed by run_id, with
    # metrics derived from the determinations (fail-soft observability fired).
    assert len(recorded) == 1
    rec_run_id, rec_metrics = recorded[0]
    assert rec_run_id == "run-ORCH"
    assert rec_metrics["status"] == "needs_review"
    assert rec_metrics["n_determinations"] == 2
    assert rec_metrics["n_verified"] == 1
    assert rec_metrics["n_needs_review"] == 1
    # metrics faithfully mirror the SAME invariant check the epilogue ran (empty scope
    # -> no expected programs -> no violations), proving the result is wired into the
    # metric, not hardcoded.
    expected_violations = check_invariants(
        {"scope": {}, "determinations": determinations, "status": "needs_review"}, []
    )
    assert rec_metrics["n_invariant_violations"] == len(expected_violations)
    assert rec_metrics["invariant_violations"] == expected_violations


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


def test_orchestrate_epilogue_is_fail_soft(monkeypatch):
    """The post-run observability/invariants epilogue must NEVER raise out of
    orchestrate nor alter the returned determinations. Even if record_run blows up
    (or STORE has no scope for the run), orchestrate returns finalize's output
    verbatim. This is the deliberate inverse of the fail-LOUD core above."""
    set_active_run_id(None)

    plan = _FakeFn(json.dumps({"run_id": "run-SOFT", "candidate_summary": "x"}))
    supervisor = _FakeFn("ok")
    final_payload = json.dumps(
        {"run_id": "run-SOFT", "determinations": [{"requirement": "R", "applies": "yes"}], "status": "complete"}
    )
    finalize = _FakeFn(final_payload)
    builder = _FakeBuilder({"plan_candidates": plan, "supervisor": supervisor, "finalize": finalize})

    # Deliberately do NOT seed STORE for run-SOFT, AND make record_run explode. Either
    # alone would break a non-fail-soft epilogue; together they prove the guard holds.
    def _boom(run_id, metrics):
        raise RuntimeError("raindrop exploded")

    monkeypatch.setattr(orchestrate_mod, "record_run", _boom)

    out = asyncio.run(_drive(builder, "{}"))  # must NOT raise

    # determinations are the product: returned unchanged despite the epilogue failing.
    assert out == final_payload
    assert json.loads(out)["status"] == "complete"
