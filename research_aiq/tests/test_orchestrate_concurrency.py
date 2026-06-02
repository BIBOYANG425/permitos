"""Concurrency regression: orchestrate must not let two interleaved runs clobber
each other's process-global active run_id.

WHY this matters: run_id reaches the supervisor's tools (spawn_researchers,
submit_plan) through a SINGLE process-global (`get_active_run_id`) because the
contextvar does not survive langgraph's forked tool context. nat's LOCAL eval
runner executes dataset items CONCURRENTLY (an unconditional `asyncio.gather` over
items with no honored concurrency cap), so without serialization item B's
`set_active_run_id(runB)` would overwrite item A's active id while A's supervisor
is still mid-flight — and A's researcher bundles would be written into B's run (or
rejected). orchestrate fixes this by holding `run_store._ACTIVE_RUN_LOCK` across
the set_active_run_id -> supervisor window so only one run's active-id window is
open at a time.

These tests drive orchestrate's REAL inner `_call` (via the registered FunctionInfo)
with fake sub-functions, where each run's fake supervisor — while "active" — calls
the REAL `spawn_researchers._spawn_impl` (with a fake fanout) and resolves run_id
through `get_active_run_id()` (NOT an explicit kwarg, and with the contextvar
cleared to mimic langgraph's forked context that dropped it). They then assert each
run's STORE ends up with ONLY its own bundles and that the active id each run
observes never drifts to the other's. The companion test monkeypatches the lock to
a no-op and forces an interleave to prove the harness genuinely DETECTS
contamination — i.e. the passing case is not vacuous.
"""

from __future__ import annotations

import asyncio
import json

import research_aiq.functions.orchestrate as orchestrate_mod
from research_aiq.functions.orchestrate import OrchestrateConfig, orchestrate
from research_aiq.functions.spawn_researchers import _spawn_impl
from research_aiq.run_store import (
    STORE,
    get_active_run_id,
    set_active_run_id,
    set_run_id,
)


def _seed_run(run_id: str, hyp_id: str) -> None:
    """Seed STORE exactly the way plan_candidates would for a one-candidate run."""
    STORE.init(
        run_id,
        scope={"run_id": run_id},
        candidates=[{"id": hyp_id, "family": "air"}],
        tasks=[{"hypothesis_id": hyp_id, "allowed_tools": ["fetch_source"], "budget": {}}],
    )


def _make_fake_supervisor(run_id: str, hyp_id: str, observations: list[str], gate: asyncio.Event):
    """Build a fake supervisor coroutine fn for `run_id`.

    While "active" it: (a) records the active id on entry, (b) yields the event loop
    repeatedly so a *concurrent* run gets every chance to interleave, (c) calls the
    REAL `_spawn_impl` resolving run_id ONLY through `get_active_run_id()` (the
    contextvar is cleared first to mimic langgraph's forked tool context), and (d)
    records the active id on exit. If the global was clobbered mid-window, the
    spawned bundle lands in the WRONG run and the entry/exit observations diverge.
    """

    async def fake_fanout(task_specs):
        # Yield again from inside the "Modal" call — maximal interleave opportunity.
        await asyncio.sleep(0)
        return [
            {
                "hypothesis_id": spec["hypothesis_id"],
                "sources": [{"url": f"src-{run_id}", "quote": "q"}],
                "researcher_conclusion": "applies",
                "extracted_claims": [],
                "uncertainties": [],
            }
            for spec in task_specs
        ]

    async def supervisor_call(_candidate_summary: str) -> str:
        # Mimic langgraph's forked tool context: the contextvar does NOT carry our
        # run_id into the tool, so resolution must come from the process-global.
        set_run_id(None)  # type: ignore[arg-type]
        observations.append(f"{run_id}:entry:{get_active_run_id()}")

        # Let any concurrent run run. With the lock this is a no-op race-wise (the
        # other run is parked on the lock); without it, this is where the global is
        # clobbered.
        await gate.wait()
        await asyncio.sleep(0)

        # REAL spawn_researchers, resolving run_id via get_active_run_id() ONLY.
        out = await _spawn_impl(json.dumps({"hypothesis_ids": [hyp_id]}), fanout=fake_fanout)
        parsed = json.loads(out)
        # The tool must have resolved to OUR run and accepted OUR hypothesis.
        assert parsed.get("investigated"), f"{run_id}: spawn saw no investigated ids"
        assert parsed["investigated"][0]["hypothesis_id"] == hyp_id

        observations.append(f"{run_id}:exit:{get_active_run_id()}")
        return "supervisor done"

    return supervisor_call


class _ProgrammableFn:
    """nat-Function stand-in: plan/finalize return canned JSON; supervisor delegates
    to a provided coroutine fn so it can run real spawn logic while 'active'."""

    def __init__(self, result: str | None = None, call=None):
        self._result = result
        self._call = call

    async def acall_invoke(self, value: str) -> str:
        if self._call is not None:
            return await self._call(value)
        return self._result


class _FakeBuilder:
    def __init__(self, fns: dict[str, _ProgrammableFn]):
        self._fns = fns

    async def get_function(self, name: str) -> _ProgrammableFn:
        return self._fns[name]


async def _drive(builder: _FakeBuilder, scope_json: str) -> str:
    async with orchestrate(OrchestrateConfig(), builder) as info:  # type: ignore[arg-type]
        return await info.single_fn(scope_json)


def _build_run(run_id: str, hyp_id: str, observations: list[str], gate: asyncio.Event):
    plan = _ProgrammableFn(
        json.dumps({"run_id": run_id, "candidate_summary": f"- {hyp_id} [air] q?"})
    )
    supervisor = _ProgrammableFn(call=_make_fake_supervisor(run_id, hyp_id, observations, gate))
    finalize = _ProgrammableFn(
        json.dumps({"run_id": run_id, "determinations": [], "status": "needs_review"})
    )
    builder = _FakeBuilder(
        {"plan_candidates": plan, "supervisor": supervisor, "finalize": finalize}
    )
    return builder


def test_interleaved_orchestrate_runs_do_not_cross_contaminate(monkeypatch):
    """Two orchestrate runs gathered concurrently must each keep their OWN run_id
    window and STORE bundles. With the lock this is deterministic; the supervisors
    yield the event loop aggressively to surface any interleaving."""
    set_active_run_id(None)
    _seed_run("runA", "H-A")
    _seed_run("runB", "H-B")

    # Don't POST telemetry to Raindrop during the epilogue.
    monkeypatch.setattr(orchestrate_mod, "record_run", lambda run_id, metrics: None)

    observations: list[str] = []
    gate = asyncio.Event()

    async def scenario():
        builder_a = _build_run("runA", "H-A", observations, gate)
        builder_b = _build_run("runB", "H-B", observations, gate)
        task_a = asyncio.create_task(_drive(builder_a, "{}"))
        task_b = asyncio.create_task(_drive(builder_b, "{}"))
        # Let both tasks advance up to the gate before opening it, maximizing the
        # chance both supervisors are "in flight" simultaneously (only possible if
        # the lock is broken; with the lock the second run is parked before entry).
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        gate.set()
        await asyncio.gather(task_a, task_b)

    asyncio.run(scenario())

    # Each run's window is internally consistent: the active id it saw on entry and
    # on exit is ITS OWN and never drifted to the sibling run.
    assert "runA:entry:runA" in observations
    assert "runA:exit:runA" in observations
    assert "runB:entry:runB" in observations
    assert "runB:exit:runB" in observations

    # The decisive cross-contamination check: each run's STORE holds ONLY its own
    # hypothesis bundle. A clobbered global would route a bundle into the wrong run.
    assert STORE.investigated_ids("runA") == ["H-A"]
    assert STORE.investigated_ids("runB") == ["H-B"]
    assert STORE.bundles("runA")[0]["sources"][0]["url"] == "src-runA"
    assert STORE.bundles("runB")[0]["sources"][0]["url"] == "src-runB"


def test_harness_detects_contamination_without_the_lock(monkeypatch):
    """Proves the no-contamination test above is NOT vacuous: with the lock replaced
    by a no-op context manager and a forced interleave, the SAME machinery observes a
    clobbered active run_id. This is the failure mode the real lock prevents."""
    set_active_run_id(None)
    # Both runs share a candidate id, so a clobbered global routes A's bundle
    # straight INTO B's run (the worst-case cross-contamination, not a mere reject).
    _seed_run("runA", "H-SHARED")
    _seed_run("runB", "H-SHARED")
    monkeypatch.setattr(orchestrate_mod, "record_run", lambda run_id, metrics: None)

    # Replace the serializing lock with a REENTRANT no-op async context manager
    # (a real asyncio.Lock is one-at-a-time; this lets both runs "hold" it at once,
    # which is precisely the unguarded condition we want to reproduce).
    class _NoLock:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    monkeypatch.setattr(orchestrate_mod, "_ACTIVE_RUN_LOCK", _NoLock())

    observations: list[str] = []

    # A handoff barrier that ONLY works when the window is unguarded: runA parks
    # after setting the global; runB then sets the global to runB and signals; runA
    # resumes and reads the (now clobbered) global. With the real lock this would
    # deadlock — which is exactly why we only do it in the no-lock scenario.
    a_parked = asyncio.Event()
    b_set_global = asyncio.Event()

    async def fake_fanout_a(task_specs):
        # A's researcher result, tagged so we can prove WHOSE bundle landed where.
        return [
            {
                "hypothesis_id": s["hypothesis_id"],
                "sources": [{"url": "src-runA", "quote": "q"}],
                "researcher_conclusion": "applies",
            }
            for s in task_specs
        ]

    async def supervisor_a(_summary: str) -> str:
        set_run_id(None)  # type: ignore[arg-type]
        a_parked.set()
        await b_set_global.wait()  # let B clobber the global first
        observations.append(f"runA:after-yield:{get_active_run_id()}")
        # Resolve via the global only — it now points at runB, so A's bundle is
        # written into B's STORE.
        await _spawn_impl(json.dumps({"hypothesis_ids": ["H-SHARED"]}), fanout=fake_fanout_a)
        return "a done"

    async def supervisor_b(_summary: str) -> str:
        await a_parked.wait()  # ensure A set the global first, then overwrite it
        set_run_id(None)  # type: ignore[arg-type]
        # B's orchestrate already called set_active_run_id("runB") before this fn;
        # signal that the global is now clobbered from A's perspective.
        b_set_global.set()
        observations.append(f"runB:entry:{get_active_run_id()}")
        return "b done"

    async def scenario():
        builder_a = _FakeBuilder(
            {
                "plan_candidates": _ProgrammableFn(
                    json.dumps({"run_id": "runA", "candidate_summary": "x"})
                ),
                "supervisor": _ProgrammableFn(call=supervisor_a),
                "finalize": _ProgrammableFn(
                    json.dumps({"run_id": "runA", "determinations": [], "status": "needs_review"})
                ),
            }
        )
        builder_b = _FakeBuilder(
            {
                "plan_candidates": _ProgrammableFn(
                    json.dumps({"run_id": "runB", "candidate_summary": "x"})
                ),
                "supervisor": _ProgrammableFn(call=supervisor_b),
                "finalize": _ProgrammableFn(
                    json.dumps({"run_id": "runB", "determinations": [], "status": "needs_review"})
                ),
            }
        )
        await asyncio.gather(_drive(builder_a, "{}"), _drive(builder_b, "{}"))

    asyncio.run(scenario())

    # WITHOUT the lock, runA's supervisor sees the global already clobbered to runB,
    # and runA's researcher bundle is misrouted INTO runB's STORE. This is the bug
    # the real asyncio.Lock prevents.
    assert "runA:after-yield:runB" in observations, observations
    # A's tagged bundle (src-runA) landed in B's run; A's own run got nothing.
    assert STORE.investigated_ids("runB") == ["H-SHARED"]
    assert STORE.bundles("runB")[0]["sources"][0]["url"] == "src-runA"
    assert STORE.investigated_ids("runA") == []
