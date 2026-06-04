"""Host-side modal.Sandbox provisioning for research_agentic (Phase 1: image + session).

build_sandbox_image() defines the per-subagent container: the doc/web tool deps + the
research_agentic package (so `python -m research_agentic.sandbox_runtime` resolves inside).
Playwright + chromium are added in Phase 2 (heavy). SandboxSession (Task 15) provisions one
modal.Sandbox per subagent and run_tool() execs the in-sandbox dispatcher.
"""

from __future__ import annotations

from pathlib import Path

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
