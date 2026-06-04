"""run_researcher — drive ONE researcher end-to-end in its own sandbox (Phase 2).

provision a SandboxSession (with the OpenAI secret) -> bind it via use_sandbox_session in
the SAME coroutine that drives the agent (so the tools' current_sandbox_session() sees it;
verified to propagate into the langgraph ToolNode) -> run the researcher tool_calling_agent
-> collect the finding + tool-call trace -> tear the sandbox down. No orchestrator/verifier
yet (Phase 3). Operational failures (SandboxOperationalError) propagate fail-loud.
"""

from __future__ import annotations

import asyncio
import pathlib
from dataclasses import dataclass, field
from typing import Any

from research_agentic.sandbox import SandboxSession, use_sandbox_session
from research_agentic.store import RunArtifacts, collect_run
from research_agentic.task import ResearcherTask

_CONFIG = pathlib.Path(__file__).resolve().parent / "configs" / "researcher.yml"


@dataclass
class ResearcherResult:
    run_id: str
    agent_output: str
    findings: list[dict[str, Any]] = field(default_factory=list)
    trace: list[dict[str, Any]] = field(default_factory=list)
    artifacts: list[str] = field(default_factory=list)


def _make_session(run_id: str) -> SandboxSession:
    # Default secrets (OpenAI) are applied inside SandboxSession.
    return SandboxSession(run_id=run_id, timeout_seconds=900)


async def _run_agent(input_message: str) -> str:
    """Run the researcher workflow once via the proven nat path. Imported lazily so the
    unit test (which monkeypatches this) needs neither nat nor a config build."""
    from nat.runtime.loader import load_workflow

    async with load_workflow(str(_CONFIG)) as session_manager:
        async with session_manager.run(input_message) as runner:
            return await runner.result(to_type=str)


async def _drive(task: ResearcherTask) -> ResearcherResult:
    session = _make_session(task.run_id)
    with session:  # provisions the modal.Sandbox (or the fake in tests)
        # Bind the session in THIS coroutine so the tools resolve it (contextvar propagates
        # into the agent's tool nodes — see plan KEY FACTS #3). Drive the agent, then collect.
        with use_sandbox_session(session):
            agent_output = await _run_agent(task.to_input_message())
            arts: RunArtifacts = collect_run(session)
    return ResearcherResult(
        run_id=task.run_id, agent_output=agent_output,
        findings=arts.findings, trace=arts.trace, artifacts=arts.artifacts,
    )


def run_researcher(task: ResearcherTask) -> ResearcherResult:
    """Synchronous entry point. Runs the async driver on a fresh event loop."""
    return asyncio.run(_drive(task))
