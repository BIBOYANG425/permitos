"""write_artifact + submit_finding — run-workspace artifact tools.

Ported from the parent repo's tools.py (PR #38). Both write into the per-run workspace
under the sandbox's artifact_root, path-guarded against traversal. submit_finding is the
researcher's terminal tool (Phase 2 wires its terminality); here it validates inputs,
SSRF-checks every source URL, and persists the finding JSON.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from research_agentic.policy import (
    SandboxPolicy,
    _error,
    _exception_error,
    _invalid_argument,
    _resolve_artifact_path,
    _safe_run_workspace,
    _success,
    host_fetchable,
)


def write_artifact(policy: SandboxPolicy, relative_path: str | Path, contents: str | bytes) -> dict[str, Any]:
    if not isinstance(relative_path, (str, Path)):
        return _invalid_argument("relative_path", "a string or Path", relative_path)
    if not isinstance(contents, (str, bytes)):
        return _invalid_argument("contents", "a string or bytes", contents)
    try:
        workspace = _safe_run_workspace(policy)
        path = _resolve_artifact_path(policy, relative_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(contents, bytes):
            path.write_bytes(contents)
            bytes_written = len(contents)
        else:
            path.write_text(contents, encoding="utf-8")
            bytes_written = len(contents.encode())
        return _success("written", path=str(path), workspace=str(workspace), bytes_written=bytes_written)
    except TypeError as exc:
        return _error("error", "invalid_argument", str(exc), path=str(relative_path))
    except ValueError as exc:
        return _error("error", "path_traversal", str(exc), path=str(relative_path))
    except Exception as exc:
        return _exception_error("artifact_write_failed", exc, path=str(relative_path))


def submit_finding(
    policy: SandboxPolicy,
    *,
    title: str,
    summary: str,
    sources: list[str],
    confidence: float,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not isinstance(title, str):
        return _invalid_argument("title", "a string", title)
    if not isinstance(summary, str):
        return _invalid_argument("summary", "a string", summary)
    if not isinstance(sources, list):
        return _invalid_argument("sources", "a list of strings", sources)
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
        return _invalid_argument("confidence", "a number between 0 and 1", confidence)
    if metadata is not None and not isinstance(metadata, dict):
        return _invalid_argument("metadata", "a dictionary", metadata)
    if not title.strip():
        return _error("error", "missing_title", "Finding title must not be empty.")
    if not summary.strip():
        return _error("error", "missing_summary", "Finding summary must not be empty.")
    if confidence < 0 or confidence > 1:
        return _error("error", "invalid_confidence", "Finding confidence must be between 0 and 1.")

    source_error = _validate_sources(sources, policy)
    if source_error is not None:
        return source_error

    finding = {
        "run_id": policy.run_id,
        "title": title,
        "summary": summary,
        "sources": list(sources),
        "confidence": confidence,
        "metadata": metadata or {},
        "submitted_at": datetime.now(UTC).isoformat(),
    }
    artifact = write_artifact(policy, f"findings/{_slug(title)}.json", json.dumps(finding, indent=2, sort_keys=True))
    if not artifact["ok"]:
        return artifact
    return _success("submitted", finding=finding, artifact_path=artifact["path"])


def _validate_sources(sources: list[str], policy: SandboxPolicy) -> dict[str, Any] | None:
    disallowed = []
    malformed = []
    for source in sources:
        if not isinstance(source, str):
            return _invalid_argument("sources", "a list of strings", source)
        trimmed = source.strip()
        parsed = urlparse(trimmed)
        scheme = parsed.scheme.lower()
        if scheme in {"http", "https"}:
            if not parsed.hostname:
                malformed.append(source)
            elif not host_fetchable(trimmed):
                disallowed.append(source)
        elif parsed.netloc:
            malformed.append(source)
        elif scheme:
            continue
        elif trimmed.lower().startswith(("http:", "https:")):
            malformed.append(source)

    if malformed:
        return _error("error", "source_url_invalid", "One or more finding sources are malformed HTTP(S) URLs.", sources=malformed)
    if disallowed:
        return _error("blocked", "host_not_allowed", "One or more finding sources are outside sandbox policy.", sources=disallowed)
    return None


def _slug(value: str) -> str:
    chars = [char.lower() if char.isalnum() else "-" for char in value.strip()]
    slug = "".join(chars).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "finding"
