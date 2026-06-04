"""In-sandbox tool dispatcher: `python -m research_agentic.sandbox_runtime <tool> <json-args>`.

Runs INSIDE the modal.Sandbox. Builds a SandboxPolicy from the environment (RUN_ID,
ARTIFACT_ROOT, RESEARCH_SANDBOX_TIMEOUT), routes the tool name + JSON args to the ported
body, and prints exactly one JSON object to stdout. Every failure mode (unknown tool, bad
args JSON, body exception) is converted to a structured {"ok": false, ...} result — this
process must not raise across the host boundary; a true crash is signalled to the host by
a non-zero exit code (handled in sandbox.run_tool).
"""

from __future__ import annotations

import hashlib
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
    return web.web_search(policy, str(args.get("query", "")), limit=args.get("limit", 5))


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
    raw_sources = args.get("sources") or []
    sources = raw_sources if isinstance(raw_sources, list) else [raw_sources]
    return artifacts.submit_finding(
        policy,
        title=str(args.get("title", "")),
        summary=str(args.get("summary", "")),
        sources=sources,
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
    raw_timeout = os.environ.get("RESEARCH_SANDBOX_TIMEOUT", "15")
    try:
        timeout = float(raw_timeout)
    except ValueError:
        timeout = 15.0
    return SandboxPolicy(run_id=run_id, artifact_root=root, timeout_seconds=timeout)


def _trace_record(tool: str, args: dict, result: dict) -> dict:
    """A compact, provenance-bearing record of one tool call (no full text blobs)."""
    rec = {"tool": tool, "ok": bool(result.get("ok")), "status": result.get("status")}
    for k in ("url", "final_url", "status_code", "extracted_format", "skill_id", "artifact_path", "path"):
        if k in result:
            rec[k] = result[k]
    text = result.get("text")
    if isinstance(text, str) and text:
        rec["text_sha256"] = hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()
        rec["text_len"] = len(text)
    snap = result.get("snapshot")
    if isinstance(snap, dict):
        for k in ("url", "status_code", "content_type"):
            if k in snap and k not in rec:
                rec[k] = snap[k]
        snap_text = snap.get("text")
        if isinstance(snap_text, str) and snap_text and "text_sha256" not in rec:
            rec["text_sha256"] = hashlib.sha256(snap_text.encode("utf-8", "replace")).hexdigest()
            rec["text_len"] = len(snap_text)
    return rec


def _append_trace(policy: SandboxPolicy, record: dict) -> None:
    try:
        d = Path(policy.artifact_root) / policy.run_id
        d.mkdir(parents=True, exist_ok=True)
        with (d / "trace.jsonl").open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record) + "\n")
    except OSError:
        pass  # tracing is best-effort; never break a tool call


def collect_workspace(policy: SandboxPolicy) -> dict[str, Any]:
    """Read the run workspace: submitted findings, the tool-call trace, and any write_artifacts.
    Host-driven (not an agent tool). Returns one JSON-able dict."""
    root = Path(policy.artifact_root) / policy.run_id
    findings: list[dict] = []
    fdir = root / "findings"
    if fdir.is_dir():
        for fp in sorted(fdir.glob("*.json")):
            try:
                findings.append(json.loads(fp.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                continue
    trace: list[dict] = []
    tf = root / "trace.jsonl"
    if tf.is_file():
        for line in tf.read_text(encoding="utf-8").splitlines():
            try:
                trace.append(json.loads(line))
            except ValueError:
                continue
    artifacts = [str(p.relative_to(root)) for p in sorted(root.rglob("*"))
                 if p.is_file() and p.name != "trace.jsonl" and fdir not in p.parents]  # exclude trace + findings/ subtree
    return {"ok": True, "run_id": policy.run_id, "findings": findings, "trace": trace, "artifacts": artifacts}


def dispatch(tool: str, args: dict[str, Any], policy: SandboxPolicy) -> dict[str, Any]:
    fn = _TOOLS.get(tool)
    if fn is None:
        result = _error("error", "unknown_tool", f"Unknown tool: {tool!r}.", tool=tool, known=sorted(_TOOLS))
    else:
        try:
            result = fn(policy, args)
        except Exception as exc:  # noqa: BLE001 — never raise across the sandbox boundary
            result = _error("error", "tool_call_failed", str(exc), tool=tool, exception_type=exc.__class__.__name__)
    try:
        _append_trace(policy, _trace_record(tool, args, result))
    except Exception:  # noqa: BLE001 — tracing is best-effort; it must never break the boundary
        pass
    return result


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(json.dumps(_error("error", "bad_invocation", "usage: sandbox_runtime <tool> <json-args>")))
        return 0
    tool = argv[1]
    if tool == "__collect__":
        print(json.dumps(collect_workspace(policy_from_env())))
        return 0
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
    # Soft errors return 0 with a structured {"ok": false} JSON; the host distinguishes
    # success/failure by the "ok" field, reserving non-zero exit for true crashes.
    print(json.dumps(dispatch(tool, args, policy)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
