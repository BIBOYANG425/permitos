"""In-sandbox tool dispatcher: `python -m research_agentic.sandbox_runtime <tool> <json-args>`.

Runs INSIDE the modal.Sandbox. Builds a SandboxPolicy from the environment (RUN_ID,
ARTIFACT_ROOT, RESEARCH_SANDBOX_TIMEOUT), routes the tool name + JSON args to the ported
body, and prints exactly one JSON object to stdout. Every failure mode (unknown tool, bad
args JSON, body exception) is converted to a structured {"ok": false, ...} result — this
process must not raise across the host boundary; a true crash is signalled to the host by
a non-zero exit code (handled in sandbox.run_tool).
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Callable

from research_agentic.policy import SandboxPolicy, _error
from research_agentic.sandbox_tools import artifacts, compute, documents, skills, web
from research_agentic.sandbox_tools import browser as browser_mod


def _t_read_skill(policy: SandboxPolicy, args: dict[str, Any]) -> dict[str, Any]:
    return skills.read_skill(str(args.get("skill_id", "")))


def _t_web_search(policy: SandboxPolicy, args: dict[str, Any]) -> dict[str, Any]:
    return web.web_search(policy, str(args.get("query", "")), limit=int(args.get("limit", 5)))


def _t_web_fetch(policy: SandboxPolicy, args: dict[str, Any]) -> dict[str, Any]:
    return web.web_fetch(policy, str(args.get("url", "")))


def _t_browser_use(policy: SandboxPolicy, args: dict[str, Any]) -> dict[str, Any]:
    return browser_mod.browser_use(policy, str(args.get("url", "")),
                                   wait_until=str(args.get("wait_until", "domcontentloaded")))


def _t_read_pdf(policy: SandboxPolicy, args: dict[str, Any]) -> dict[str, Any]:
    return documents.read_pdf(policy, str(args.get("path", "")))


def _t_read_docx(policy: SandboxPolicy, args: dict[str, Any]) -> dict[str, Any]:
    return documents.read_docx(policy, str(args.get("path", "")))


def _t_read_spreadsheet(policy: SandboxPolicy, args: dict[str, Any]) -> dict[str, Any]:
    return documents.read_spreadsheet(policy, str(args.get("path", "")))


def _t_compute(policy: SandboxPolicy, args: dict[str, Any]) -> dict[str, Any]:
    return compute.compute_voc_threshold(
        voc_content=args.get("voc_content"),
        voc_content_unit=args.get("voc_content_unit", "weight_percent"),
        density=args.get("density"),
        density_unit=args.get("density_unit", "lb/gal"),
        mass_limit_lb=args.get("mass_limit_lb"),
        usage=args.get("usage"),
        usage_unit=args.get("usage_unit", "gal"),
        control_efficiency=args.get("control_efficiency", 0.0),
    )


def _t_write_artifact(policy: SandboxPolicy, args: dict[str, Any]) -> dict[str, Any]:
    return artifacts.write_artifact(policy, str(args.get("relative_path", "")), args.get("contents", ""))


def _t_submit_finding(policy: SandboxPolicy, args: dict[str, Any]) -> dict[str, Any]:
    return artifacts.submit_finding(
        policy,
        title=str(args.get("title", "")),
        summary=str(args.get("summary", "")),
        sources=list(args.get("sources", []) or []),
        confidence=args.get("confidence", 0.0),
        metadata=args.get("metadata"),
    )


_TOOLS: dict[str, Callable[[SandboxPolicy, dict[str, Any]], dict[str, Any]]] = {
    "read_skill": _t_read_skill,
    "web_search": _t_web_search,
    "web_fetch": _t_web_fetch,
    "browser_use": _t_browser_use,
    "read_pdf": _t_read_pdf,
    "read_docx": _t_read_docx,
    "read_spreadsheet": _t_read_spreadsheet,
    "compute_voc_threshold": _t_compute,
    "write_artifact": _t_write_artifact,
    "submit_finding": _t_submit_finding,
}


def policy_from_env() -> SandboxPolicy:
    root = Path(os.environ.get("ARTIFACT_ROOT", "/workspace"))
    run_id = os.environ.get("RUN_ID", "run")
    timeout = float(os.environ.get("RESEARCH_SANDBOX_TIMEOUT", "15"))
    return SandboxPolicy(run_id=run_id, artifact_root=root, timeout_seconds=timeout)


def dispatch(tool: str, args: dict[str, Any], policy: SandboxPolicy) -> dict[str, Any]:
    fn = _TOOLS.get(tool)
    if fn is None:
        return _error("error", "unknown_tool", f"Unknown tool: {tool!r}.", tool=tool, known=sorted(_TOOLS))
    try:
        return fn(policy, args)
    except Exception as exc:  # noqa: BLE001 — never raise across the sandbox boundary
        return _error("error", "tool_call_failed", str(exc), tool=tool, exception_type=exc.__class__.__name__)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(json.dumps(_error("error", "bad_invocation", "usage: sandbox_runtime <tool> <json-args>")))
        return 0
    tool = argv[1]
    raw = argv[2] if len(argv) > 2 else "{}"
    try:
        args = json.loads(raw) if raw else {}
        if not isinstance(args, dict):
            raise ValueError("args must be a JSON object")
    except (ValueError, json.JSONDecodeError) as exc:
        print(json.dumps(_error("error", "bad_args_json", str(exc), tool=tool)))
        return 0
    # Build the workspace dir before tools that need it.
    policy = policy_from_env()
    try:
        (Path(policy.artifact_root) / policy.run_id).mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    print(json.dumps(dispatch(tool, args, policy)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
