"""Fail-loud contract audit — the pipeline must NEVER silently fabricate determinations.

A determination run is legally consequential, so every integrity failure in the
plan -> supervise -> finalize CORE must surface as an exception rather than degrade
into a fabricated or empty "done". This module locks that contract in with tests at
each external/integration boundary where a silent fallback would be most tempting:

  - Modal endpoint UNSET            -> _modal_fanout raises RuntimeError (no fallback)
  - Modal endpoint UNREACHABLE      -> _modal_fanout raises httpx.ConnectError (no
                                       fabricated/empty bundles)
  - spawn fan-out RAISES            -> _spawn_impl propagates (no swallowing)
  - finalize on an UNKNOWN run      -> _finalize_impl raises KeyError (no fabricated
                                       determinations)
  - NO OPENAI_API_KEY               -> the run hard-fails at the supervisor LLM build,
                                       BEFORE any determinations exist (see the
                                       dedicated test below for how this is covered)

The deliberate INVERSE — the post-run observability/invariants epilogue in
orchestrate — is fail-SOFT and is covered in test_orchestrate.py
(test_orchestrate_epilogue_is_fail_soft). The two contracts must not bleed into each
other: the core raises, the telemetry epilogue swallows.
"""

from __future__ import annotations

import asyncio
import inspect
import json

import pytest

from research_aiq.functions import orchestrate as orchestrate_mod
from research_aiq.functions.finalize import _finalize_impl
from research_aiq.functions.spawn_researchers import _modal_fanout, _spawn_impl
from research_aiq.run_store import STORE, set_run_id


# ---------------------------------------------------------------------------
# Modal boundary: no endpoint, and unreachable endpoint
# ---------------------------------------------------------------------------


def test_modal_fanout_no_endpoint_raises(monkeypatch):
    """With MODAL_RESEARCH_ENDPOINT unset, the fan-out raises RuntimeError rather
    than returning a deterministic/fabricated fallback bundle."""
    monkeypatch.delenv("MODAL_RESEARCH_ENDPOINT", raising=False)

    with pytest.raises(RuntimeError, match="MODAL_RESEARCH_ENDPOINT"):
        asyncio.run(_modal_fanout([{"hypothesis_id": "H-A"}]))


def test_modal_fanout_unreachable_endpoint_raises(monkeypatch):
    """Pointed at a closed port, the fan-out raises a transport (connection) error
    rather than returning fabricated or empty bundles. Connection-refused on
    127.0.0.1:1 is immediate, so this stays fast."""
    monkeypatch.setenv("MODAL_RESEARCH_ENDPOINT", "http://127.0.0.1:1")
    monkeypatch.setenv("MODAL_RESEARCH_TOKEN", "irrelevant")

    import httpx

    with pytest.raises(httpx.HTTPError):  # ConnectError is an httpx.HTTPError subclass
        asyncio.run(_modal_fanout([{"hypothesis_id": "H-A"}]))


# ---------------------------------------------------------------------------
# spawn_researchers: a raising fan-out propagates (no swallowing)
# ---------------------------------------------------------------------------


def test_spawn_impl_propagates_fanout_failure():
    """A fan-out that raises propagates through _spawn_impl unchanged — there is no
    silent deterministic fallback and no swallowing. (Also asserted in
    test_spawn_researchers.py; re-asserted here so the fail-loud contract is locked
    in one place.)"""
    run_id = "fl-spawn"
    STORE.init(
        run_id,
        scope={"run_id": run_id},
        candidates=[{"id": "H-A", "family": "air"}],
        tasks=[{"hypothesis_id": "H-A", "allowed_tools": [], "budget": {}}],
    )
    set_run_id(run_id)

    async def boom(task_specs):
        raise RuntimeError("modal unreachable")

    with pytest.raises(RuntimeError, match="modal unreachable"):
        asyncio.run(
            _spawn_impl(json.dumps({"hypothesis_ids": ["H-A"]}), fanout=boom, run_id=run_id)
        )


# ---------------------------------------------------------------------------
# finalize: an unknown run raises rather than fabricating determinations
# ---------------------------------------------------------------------------


def test_finalize_unknown_run_raises_no_fabrication():
    """_finalize_impl on a run_id that was never seeded in the STORE raises KeyError
    (the STORE.scope lookup) — it must NEVER fabricate a determinations payload for a
    run that produced no evidence."""
    with pytest.raises(KeyError):
        asyncio.run(_finalize_impl(json.dumps({"run_id": "does-not-exist-fl"})))


# ---------------------------------------------------------------------------
# No OPENAI_API_KEY — the run hard-fails BEFORE any determinations exist
# ---------------------------------------------------------------------------


def test_no_openai_key_hardfail_is_covered_by_live_smoke_and_has_no_fallback():
    """NO-KEY hard-fail: chosen approach (b) from the task.

    A `nat run` with OPENAI_API_KEY unset fails when nat BUILDS the openai LLM /
    tool_calling_agent supervisor — strictly BEFORE the agent calls the API and
    therefore before any determination could be produced. That live behavior was
    verified TWICE during this build (Tasks 9 & 12): `openai.OpenAIError: Missing
    credentials`, process exit 1, and NO determinations JSON on stdout (no tokens
    spent — it fails before the first API call).

    We deliberately do NOT re-run a full `nat run` subprocess here: it is slow and
    environment-dependent (needs the rest of .env.local) for no additional safety
    over the live smoke. Instead this test unit-asserts the load-bearing structural
    invariant that makes the live hard-fail SAFE: there is NO code path in
    `orchestrate` that yields determinations without first awaiting the supervisor
    LLM. Concretely, in orchestrate's inner `_call`:

      1. the supervisor is awaited UNCONDITIONALLY before finalize is called, and
      2. there is no fabricated-result fallback (no `try`/`except` guarding the
         plan -> supervise -> finalize core) that could short-circuit to a
         determinations payload when the LLM is unavailable.

    If the supervisor build/await fails (the no-key case), the exception propagates
    out of `_call` and no `final` is ever returned. So no key => no determinations,
    by construction — which is exactly what the live smoke observed.
    """
    src = inspect.getsource(orchestrate_mod.orchestrate)

    # (1) The supervisor is awaited, and that await precedes the finalize call.
    assert "await supervisor.acall_invoke" in src
    assert "await finalize.acall_invoke" in src
    assert src.index("await supervisor.acall_invoke") < src.index("await finalize.acall_invoke")

    # (2) The ONLY try/except in orchestrate is the fail-soft post-run epilogue
    #     (observability + invariants), NOT a guard around the core. Assert there is
    #     exactly one `try:` and that it sits AFTER finalize is awaited (i.e. it
    #     cannot wrap plan/supervise/finalize). This is what keeps the core fail-loud.
    assert src.count("try:") == 1, (
        "orchestrate should contain exactly one try/except (the fail-soft post-run "
        "epilogue). A second try/except risks swallowing a core failure into a "
        "fabricated determination."
    )
    assert src.index("await finalize.acall_invoke") < src.index("try:"), (
        "the lone try/except must come AFTER finalize (it guards only the "
        "observability/invariants epilogue), never the plan->supervise->finalize core."
    )

    # The function returns finalize's output (`return final`), and `final` is bound
    # ONLY from `await finalize.acall_invoke(...)`. There is no other `return` in the
    # core that could hand back a fabricated payload when the LLM is unavailable.
    assert "return final" in src
    assert "final = await finalize.acall_invoke" in src
    # The core has exactly two returns: the early "no new valid ids"? No — that's in
    # spawn. In orchestrate's _call the only `return` is `return final` (the epilogue
    # has no return of its own). Pin that there is no SECOND, fabricating return.
    assert src.count("return ") == 1
