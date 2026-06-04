"""Collect a researcher run's artifacts out of its sandbox before teardown.

Execs the dispatcher's host-driven __collect__ command (findings + tool-call trace +
write_artifacts) and returns them. Fail-loud (SandboxOperationalError) if the collect
process crashes or returns garbage — same operational-failure discipline as run_tool.
Phase 4 adds Supabase/Modal-volume persistence; Phase 2 returns the structure in-memory.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from research_agentic.sandbox import SandboxOperationalError


@dataclass
class RunArtifacts:
    run_id: str
    findings: list[dict[str, Any]] = field(default_factory=list)
    trace: list[dict[str, Any]] = field(default_factory=list)
    artifacts: list[str] = field(default_factory=list)


def collect_run(session: Any) -> RunArtifacts:
    proc = session.sandbox.exec("python", "-m", "research_agentic.sandbox_runtime", "__collect__")
    stdout = proc.stdout.read()
    code = proc.wait()
    if code != 0:
        raise SandboxOperationalError(f"__collect__ exited {code}: {(stdout or '')[:500]}")
    text = (stdout or "").strip()
    last = text.splitlines()[-1] if text else ""
    try:
        data = json.loads(last)
    except (ValueError, json.JSONDecodeError) as exc:
        raise SandboxOperationalError(f"__collect__ returned unparseable output: {text[:500]!r}") from exc
    if not isinstance(data, dict) or not data.get("ok"):
        raise SandboxOperationalError(f"__collect__ returned non-ok: {data!r}")
    return RunArtifacts(
        run_id=str(data.get("run_id", session.run_id)),
        findings=list(data.get("findings", [])),
        trace=list(data.get("trace", [])),
        artifacts=list(data.get("artifacts", [])),
    )
