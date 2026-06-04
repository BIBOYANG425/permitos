"""Host-side modal.Sandbox provisioning for research_agentic (Phase 1: image + session).

build_sandbox_image() defines the per-subagent container: the doc/web tool deps + the
research_agentic package (so `python -m research_agentic.sandbox_runtime` resolves inside).
Playwright + chromium are added in Phase 2 (heavy). SandboxSession (Task 15) provisions one
modal.Sandbox per subagent and run_tool() execs the in-sandbox dispatcher.
"""

from __future__ import annotations

import contextlib
import contextvars
import json as _json
from pathlib import Path
from typing import Any, Iterator, Optional

import modal

_REPO_ROOT = Path(__file__).resolve().parents[2]  # .../permitos
_APP_NAME = "permitpilot-agentic-sandbox"

# Tool deps installed INSIDE the sandbox (NOT host deps). httpx + pymupdf + bs4 cover the
# Phase 1 web_fetch path; python-docx/openpyxl cover documents; openai covers web_search.
_SANDBOX_PIP = (
    "httpx",
    "pymupdf",
    "beautifulsoup4",
    "python-docx",
    "openpyxl",
    "openai",
)


def build_sandbox_image() -> modal.Image:
    """The per-subagent sandbox image. Copies research_agentic in and pip-installs it
    (--no-deps; the tool deps are listed explicitly above) so the in-sandbox dispatcher
    is importable as a module."""
    return (
        modal.Image.debian_slim(python_version="3.12")
        .pip_install(*_SANDBOX_PIP)
        .add_local_dir(
            str(_REPO_ROOT / "research_agentic"),
            remote_path="/root/research_agentic_pkg",
            copy=True,
        )
        .run_commands("pip install --no-deps -e /root/research_agentic_pkg")
        .workdir("/root/research_agentic_pkg")
    )


# ----- session + run_tool + contextvar -----


class SandboxOperationalError(RuntimeError):
    """Fail-loud operational failure: the in-sandbox process crashed, exited non-zero, or
    returned unparseable output. This is NOT a tool-level {"ok": false} result — it means
    the sandbox itself failed and the caller must restart/error-code (per the spec)."""


_current_session: contextvars.ContextVar[Optional["SandboxSession"]] = contextvars.ContextVar(
    "research_agentic_current_sandbox_session", default=None
)


def current_sandbox_session() -> Optional["SandboxSession"]:
    return _current_session.get()


@contextlib.contextmanager
def use_sandbox_session(session: "SandboxSession") -> Iterator["SandboxSession"]:
    token = _current_session.set(session)
    try:
        yield session
    finally:
        _current_session.reset(token)


class SandboxSession:
    """One per-subagent modal.Sandbox, provisioned with build_sandbox_image() under the
    safety policy (open egress + in-sandbox SSRF guard). Use as a context manager; the
    sandbox is terminated on exit. The researcher (Phase 2) holds one of these for its
    whole run; each tool call is a fresh `exec` into the same container (workspace persists
    on disk between calls)."""

    def __init__(
        self,
        run_id: str,
        *,
        timeout_seconds: int = 900,
        cpu: float | None = None,
        memory: int | None = None,
        secrets: list[Any] | None = None,
    ) -> None:
        self.run_id = run_id
        self._timeout = timeout_seconds
        self._cpu = cpu
        self._memory = memory
        self._secrets = secrets or []
        self.sandbox: Any = None

    def __enter__(self) -> "SandboxSession":
        app = modal.App.lookup(_APP_NAME, create_if_missing=True)
        self.sandbox = modal.Sandbox.create(
            app=app,
            image=build_sandbox_image(),
            timeout=self._timeout,
            cpu=self._cpu,
            memory=self._memory,
            secrets=self._secrets,
            workdir="/root/research_agentic_pkg",
            # Open egress for real discovery; SSRF is blocked IN-sandbox by host_fetchable.
            # (A future hardening can pass block_network/outbound_cidr_allowlist here.)
            block_network=False,
            env={"RUN_ID": self.run_id, "ARTIFACT_ROOT": "/workspace"},
        )
        return self

    def __exit__(self, *exc: Any) -> None:
        if self.sandbox is not None:
            with contextlib.suppress(Exception):
                self.sandbox.terminate()
            self.sandbox = None


def run_tool(session: "SandboxSession", tool: str, args: dict[str, Any]) -> dict[str, Any]:
    """Execute one tool inside the session's sandbox via the in-sandbox dispatcher.

    Returns the tool's structured result dict (including {"ok": false} tool errors).
    Raises SandboxOperationalError when the SANDBOX failed (non-zero exit, empty/unparseable
    stdout) — an operational failure, distinct from a tool-level rejection."""
    proc = session.sandbox.exec(
        "python", "-m", "research_agentic.sandbox_runtime", tool, _json.dumps(args),
    )
    stdout = proc.stdout.read()
    code = proc.wait()
    if code != 0:
        stderr = ""
        with contextlib.suppress(Exception):
            stderr = proc.stderr.read()
        raise SandboxOperationalError(
            f"sandbox tool {tool!r} exited {code}: {(stderr or stdout or '')[:500]}"
        )
    text = (stdout or "").strip()
    # The dispatcher prints exactly one JSON object as its last line.
    last_line = text.splitlines()[-1] if text else ""
    try:
        result = _json.loads(last_line)
    except (ValueError, _json.JSONDecodeError) as exc:
        raise SandboxOperationalError(
            f"sandbox tool {tool!r} returned unparseable output: {text[:500]!r}"
        ) from exc
    if not isinstance(result, dict):
        raise SandboxOperationalError(f"sandbox tool {tool!r} returned non-object: {result!r}")
    return result
