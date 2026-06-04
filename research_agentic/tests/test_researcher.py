import json

import pytest

import research_agentic.researcher as R
from research_agentic.researcher import ResearcherResult, run_researcher
from research_agentic.store import RunArtifacts
from research_agentic.task import ResearcherTask


def test_run_researcher_binds_session_runs_and_collects(monkeypatch):
    seen = {}

    # Fake the agent run: assert the session contextvar is visible while "running".
    async def fake_run_agent(input_message: str) -> str:
        from research_agentic.sandbox import current_sandbox_session
        seen["session_bound"] = current_sandbox_session() is not None
        seen["input"] = input_message
        return "submitted"

    # Fake the sandbox session context manager.
    class _FakeSession:
        run_id = "run-1"
        sandbox = object()
        def __enter__(self): return self
        def __exit__(self, *a): seen["torn_down"] = True

    monkeypatch.setattr(R, "_make_session", lambda run_id: _FakeSession())
    monkeypatch.setattr(R, "_run_agent", fake_run_agent)
    monkeypatch.setattr(R, "collect_run", lambda s: RunArtifacts(
        run_id="run-1", findings=[{"title": "Rule 23 applies", "confidence": 0.8}], trace=[], artifacts=[]))

    task = ResearcherTask(run_id="run-1", hypothesis="VCAPCD Rule 23?", skill_id="vcapcd-rule-23-exemption")
    result = run_researcher(task)

    assert isinstance(result, ResearcherResult)
    assert seen["session_bound"] is True               # contextvar was set during the run
    assert json.loads(seen["input"])["hypothesis"] == "VCAPCD Rule 23?"
    assert result.findings[0]["title"] == "Rule 23 applies"
    assert seen["torn_down"] is True                    # sandbox torn down


def test_run_researcher_propagates_operational_failure(monkeypatch):
    from research_agentic.sandbox import SandboxOperationalError
    seen = {}

    class _FakeSession:
        run_id = "r"
        sandbox = object()
        def __enter__(self):
            return self
        def __exit__(self, *a):
            seen["torn_down"] = True
            return False  # re-raise

    async def boom(input_message: str) -> str:
        raise SandboxOperationalError("sandbox died mid-run")

    monkeypatch.setattr(R, "_make_session", lambda run_id: _FakeSession())
    monkeypatch.setattr(R, "_run_agent", boom)
    with pytest.raises(SandboxOperationalError):
        run_researcher(ResearcherTask(run_id="r", hypothesis="H?"))
    assert seen.get("torn_down") is True  # sandbox torn down even on failure
