"""Sandbox safety policy + shared helpers for the research_agentic tool suite.

Ported from the parent repo's src/research_core/tools.py (PR #38 head). This module is
imported BOTH inside the modal.Sandbox (by the tool bodies) and on the host (by tests
and authority checks). It holds: the SandboxPolicy dataclass, workspace path guards
(no traversal / no escape), structured {ok,status,error} result helpers, the network
SSRF guard + authority tiering (Task 4), and the per-tool output cap (Task 5).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from research_agentic.authority_hosts import DEFAULT_ALLOWED_HOSTS, ca_authority_hosts


# ----- structured results (un-foolable shape; tools never raise across the boundary) -----

def _error(status: str, code: str, message: str, **extra: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ok": False,
        "status": status,
        "error": {"code": code, "message": message},
    }
    payload.update(extra)
    return payload


def _success(status: str, **payload: Any) -> dict[str, Any]:
    result: dict[str, Any] = {"ok": True, "status": status}
    result.update(payload)
    return result


def _exception_error(code: str, exc: Exception, status: str = "error", **extra: Any) -> dict[str, Any]:
    return _error(status, code, str(exc), exception_type=exc.__class__.__name__, **extra)


def _invalid_argument(argument: str, expected: str, value: Any = None) -> dict[str, Any]:
    return _error(
        "error",
        "invalid_argument",
        f"{argument} must be {expected}.",
        argument=argument,
        received_type=type(value).__name__,
    )


# ----- sandbox policy -----

@dataclass(frozen=True)
class SandboxPolicy:
    run_id: str
    artifact_root: Path
    allowed_hosts: tuple[str, ...] = field(default_factory=lambda: DEFAULT_ALLOWED_HOSTS)
    allow_network: bool = True
    allow_browser: bool = True
    timeout_seconds: float = 15.0
    search_endpoint: str | None = None


# ----- workspace path guards (no traversal, no escape) -----

def _safe_run_workspace(policy: SandboxPolicy) -> Path:
    root = Path(policy.artifact_root).expanduser().resolve()
    workspace = (root / policy.run_id).resolve()
    if root != workspace and root not in workspace.parents:
        raise ValueError("run workspace is outside artifact root")
    return workspace


def _resolve_workspace_path(policy: SandboxPolicy, relative_path: str | Path) -> Path:
    workspace = _safe_run_workspace(policy)
    if not isinstance(relative_path, (str, Path)):
        raise TypeError("workspace path must be a string or Path")
    path = Path(relative_path)
    if path.is_absolute():
        raise ValueError("workspace path must be relative")
    resolved = (workspace / path).resolve()
    if resolved == workspace or workspace in resolved.parents:
        return resolved
    raise ValueError("workspace path escapes run workspace")


def _resolve_artifact_path(policy: SandboxPolicy, relative_path: str | Path) -> Path:
    return _resolve_workspace_path(policy, relative_path)


# ----- network SSRF guard + authority tiering -----

REDIRECT_STATUS_CODES = {301, 302, 303, 307, 308}
MAX_REDIRECT_HOPS = 5


def _normalize_host(host: str | None) -> str:
    return (host or "").strip().rstrip(".").lower()


def host_fetchable(url: str) -> bool:
    """The sandbox NETWORK boundary (a safety gate, not a content allowlist): allow any
    public http(s) host so the subagent can do broad, durable research, but block
    SSRF-dangerous targets (localhost, private/loopback/link-local nets, cloud metadata).
    Source AUTHORITY is judged downstream by source_authority_rank, not here."""
    if not isinstance(url, str):
        return False
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    host = _normalize_host(parsed.hostname)
    if not host:
        return False
    if host == "localhost" or host.endswith((".localhost", ".internal", ".local")):
        return False
    try:
        import ipaddress

        ip = ipaddress.ip_address(host)
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            return False
    except ValueError:
        pass  # a hostname, not a raw IP -> allowed
    return True


def _host_in(host: str, allowed: frozenset[str] | tuple[str, ...]) -> bool:
    return any(host == a or host.endswith("." + a) for a in allowed)


def host_allowed(url: str, allowed_hosts: tuple[str, ...] = DEFAULT_ALLOWED_HOSTS) -> bool:
    if not isinstance(url, str):
        return False
    parsed = urlparse(url)
    host = _normalize_host(parsed.hostname)
    if not host or parsed.scheme not in {"http", "https"}:
        return False
    for allowed in allowed_hosts:
        allowed_host = _normalize_host(allowed)
        if host == allowed_host or host.endswith(f".{allowed_host}"):
            return True
    return False


def source_authority_rank(url: str, allowed_hosts: tuple[str, ...] = DEFAULT_ALLOWED_HOSTS) -> int:
    """Authority tier for a fetched source (the verifier's authority gate requires <= 2):
      1 = known EHS authority — curated allowlist OR a CA air-district authority host
          (incl. .org/.us/.net like vcapcd.org)
      2 = other government / official source (*.gov, *.mil)
      3 = other public source -> fails the verifier's authority gate (fail-closed)."""
    host = _normalize_host(urlparse(url).hostname)
    if not host:
        return 3
    if host_allowed(url, allowed_hosts) or _host_in(host, ca_authority_hosts()):
        return 1
    # Suffix-only (never substring): a spoof like aqmd.gov.evil.example ends in .example,
    # so it stays rank 3.
    if host == "gov" or host == "mil" or host.endswith((".gov", ".mil")):
        return 2
    return 3
