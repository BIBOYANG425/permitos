# E Phase 1: Sandbox + Tools Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the greenfield `research_agentic` AIQ package's sandbox + tool foundation: a `modal.Sandbox` provisioning layer with a mechanical safety policy, the 10-tool open-discovery suite ported from the parent repo and executed *inside* the sandbox via a CLI dispatcher, registered as AIQ functions, with full offline unit tests and a single live tool-in-sandbox smoke. **No agents yet** (Phases 2–4).

**Architecture:** Tools run as plain Python "bodies" *inside* a per-subagent `modal.Sandbox` container. A host-side `SandboxSession` provisions the sandbox; `run_tool()` `exec`s an in-sandbox dispatcher (`python -m research_agentic.sandbox_runtime <tool> <json-args>`) which builds a `SandboxPolicy`, runs the body, and prints a structured JSON result. The container is the isolation boundary; a software `host_fetchable` SSRF guard blocks private/metadata targets from *inside* the sandbox. Thin AIQ `@register_function` wrappers (host-side) resolve the current researcher's sandbox session (a contextvar — set by Phase 2's researcher; set by tests/smoke in Phase 1) and call `run_tool`. Operational failure (sandbox death, non-zero exit, unparseable output) raises fail-loud; tool-level problems return structured `{"ok": false, "error": {...}}` dicts.

**Tech Stack:** Python 3.11+, `nvidia-nat[langchain]>=1.5` (AIQ functions), `modal>=1.4` (Sandbox), `httpx` (in-sandbox fetch). Sandbox-image-only deps (import-guarded; NOT installed on the host/test env): `pymupdf` (fitz), `beautifulsoup4`, `python-docx`, `openpyxl`, `openai`; `playwright`+chromium added in Phase 2. Tests: `pytest`, offline (no Modal, no network — monkeypatch `httpx`, use a fake sandbox).

**Verbatim source of truth for ports:** `docs/superpowers/references/2026-06-03-parent-research-core-extraction.md` (PR #38 head `6e661cf9f6ad6d2a0234254e49a24df6c74f90eb`). When a task says "port", the adapted target code is given in full below; the reference is the cross-check.

**Spec:** `docs/superpowers/specs/2026-06-03-aiq-open-discovery-researcher-design.md`.

---

## File Structure

```
research_agentic/                                  # NEW top-level package (sibling to research_aiq, research_core)
├── pyproject.toml                                 # T1  — nat.components entry point + host deps
├── README.md                                      # T1/T18
└── research_agentic/
    ├── __init__.py                                # T1
    ├── register.py                                # T1/T16 — imports function modules (AIQ discovery)
    ├── authority_hosts.py                         # T3  — static CA authority host seed (no research_core dep)
    ├── policy.py                                  # T2,T4,T5 — SandboxPolicy + guards + result helpers + caps + authority tiering
    ├── sandbox_tools/                             # in-sandbox tool BODIES (ported; run inside modal.Sandbox)
    │   ├── __init__.py                            # T6
    │   ├── compute.py                             # T6  — compute_voc_threshold (pure math)
    │   ├── artifacts.py                           # T7  — write_artifact, submit_finding
    │   ├── documents.py                           # T8  — read_pdf, read_docx, read_spreadsheet
    │   ├── web.py                                 # T9  — web_fetch, web_search (+ extraction/redirect/bot-block)
    │   ├── browser.py                             # T10 — browser_use (Playwright; live path is Phase 2)
    │   └── skills.py                              # T12 — read_skill (reads bundled skills/)
    ├── skills/                                    # T11 — ported SKILL.md + program.json library (26 programs)
    ├── sandbox_runtime.py                         # T13 — in-sandbox CLI dispatcher (python -m research_agentic.sandbox_runtime)
    ├── sandbox.py                                 # T14,T15 — HOST: image builder + SandboxSession + run_tool + contextvar
    ├── functions/
    │   ├── __init__.py                            # T16
    │   └── researcher_tools.py                    # T16 — 10 AIQ @register_function wrappers
    ├── scripts/
    │   └── smoke_web_fetch.py                     # T17 — live one-tool-in-sandbox smoke
    └── tests/                                     # offline unit tests (mirrors research_aiq/tests)
        ├── test_policy_paths.py                   # T2
        ├── test_host_fetchable.py                 # T4
        ├── test_authority_rank.py                 # T4
        ├── test_cap_text.py                       # T5
        ├── test_compute_voc.py                    # T6
        ├── test_artifacts.py                      # T7
        ├── test_documents.py                      # T8
        ├── test_web.py                            # T9
        ├── test_browser.py                        # T10
        ├── test_skills.py                         # T12
        ├── test_sandbox_runtime.py               # T13
        ├── test_sandbox_session.py               # T15
        └── test_functions.py                      # T16
```

**Import discipline (avoids cycles):** `authority_hosts.py` imports nothing internal. `policy.py` imports only `authority_hosts`. Every `sandbox_tools/*.py` imports only from `..policy` at top level; the `web ↔ browser` mutual need is satisfied by **lazy imports inside functions** (mirrors the parent's pattern). `sandbox_runtime.py` imports the bodies. Host `sandbox.py` imports `modal` only (it `exec`s the dispatcher — it does NOT import the bodies). `functions/researcher_tools.py` imports `nat` + `sandbox.py`.

---

## Task 1: Package scaffold + AIQ discovery

**Files:**
- Create: `research_agentic/pyproject.toml`
- Create: `research_agentic/README.md`
- Create: `research_agentic/research_agentic/__init__.py`
- Create: `research_agentic/research_agentic/register.py`
- Test: `research_agentic/tests/test_import.py`

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "research_agentic"
version = "0.1.0"
description = "AIQ-native open-discovery EHS research core (sub-project E): sandboxed agentic researchers."
requires-python = ">=3.11"
# HOST deps only. Heavy tool deps (pymupdf, beautifulsoup4, python-docx, openpyxl,
# openai, playwright) live in the SANDBOX image (research_agentic.sandbox.build_sandbox_image),
# import-guarded in the tool bodies, and are NOT needed on the host or in unit tests.
dependencies = ["nvidia-nat[langchain]>=1.5", "modal>=1.4", "httpx"]

[project.optional-dependencies]
dev = ["pytest>=8", "ruff>=0.6"]

[project.entry-points.'nat.components']
research_agentic = "research_agentic.register"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["research_agentic"]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 2: Write `research_agentic/research_agentic/__init__.py`**

```python
"""research_agentic — AIQ-native open-discovery EHS research core (sub-project E).

Greenfield package: sandboxed open-discovery researcher tools (Phase 1), researcher
agent (Phase 2), orchestration + senior verifier + safety stack (Phase 3), eval +
endpoint cutover (Phase 4). See docs/superpowers/specs/2026-06-03-aiq-open-discovery-researcher-design.md.
"""
```

- [ ] **Step 3: Write `research_agentic/research_agentic/register.py`** (functions added in T16; empty body now keeps entry-point discovery importable)

```python
"""Importing this module registers all research_agentic AIQ components.

nat discovers components via the [project.entry-points.'nat.components'] table, which
points here. Each researcher-tool function is registered by importing its module (the
@register_function decorators run on import). The tool functions are added in Task 16;
until then this module is intentionally import-only so entry-point discovery works.
"""

# from research_agentic.functions import researcher_tools  # noqa: F401  (enabled in Task 16)
```

- [ ] **Step 4: Write the failing test** `research_agentic/tests/test_import.py`

```python
def test_package_and_register_import():
    import research_agentic  # noqa: F401
    from research_agentic import register  # noqa: F401
    assert research_agentic.__doc__ is not None
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd research_agentic && python -m pytest tests/test_import.py -q`
Expected: 1 passed. (No venv assumed; if `nvidia-nat`/`modal` are not import-time dependencies of these specific modules, the test passes without them installed. It only imports `research_agentic` + `register`, which have no third-party imports.)

- [ ] **Step 6: Write a minimal `README.md`** (1 paragraph: what the package is, that Phase 1 = sandbox+tools, and the test command `python -m pytest tests/ -q`). Keep it short; expand in T18.

- [ ] **Step 7: Commit**

```bash
git add research_agentic/pyproject.toml research_agentic/README.md research_agentic/research_agentic/__init__.py research_agentic/research_agentic/register.py research_agentic/tests/test_import.py
git commit -m "feat(agentic): scaffold research_agentic package (E phase 1)"
```

---

## Task 2: `policy.py` — result helpers + SandboxPolicy + path guards

**Files:**
- Create: `research_agentic/research_agentic/policy.py` (first slice; T4/T5 append)
- Test: `research_agentic/tests/test_policy_paths.py`

- [ ] **Step 1: Write the failing test** `tests/test_policy_paths.py`

```python
from pathlib import Path

import pytest

from research_agentic.policy import (
    SandboxPolicy,
    _error,
    _invalid_argument,
    _resolve_workspace_path,
    _safe_run_workspace,
    _success,
)


def _policy(tmp_path: Path) -> SandboxPolicy:
    return SandboxPolicy(run_id="run-123", artifact_root=tmp_path)


def test_success_and_error_shapes():
    assert _success("done", x=1) == {"ok": True, "status": "done", "x": 1}
    err = _error("blocked", "nope", "no good", url="u")
    assert err == {"ok": False, "status": "blocked", "error": {"code": "nope", "message": "no good"}, "url": "u"}
    bad = _invalid_argument("url", "a string", 5)
    assert bad["ok"] is False and bad["error"]["code"] == "invalid_argument" and bad["received_type"] == "int"


def test_safe_run_workspace_is_under_root(tmp_path):
    ws = _safe_run_workspace(_policy(tmp_path))
    assert ws == (tmp_path / "run-123").resolve()


def test_resolve_workspace_path_allows_relative(tmp_path):
    p = _resolve_workspace_path(_policy(tmp_path), "findings/a.json")
    assert str(p).endswith("run-123/findings/a.json")


def test_resolve_workspace_path_blocks_absolute(tmp_path):
    with pytest.raises(ValueError):
        _resolve_workspace_path(_policy(tmp_path), "/etc/passwd")


def test_resolve_workspace_path_blocks_traversal(tmp_path):
    with pytest.raises(ValueError):
        _resolve_workspace_path(_policy(tmp_path), "../../escape.txt")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd research_agentic && python -m pytest tests/test_policy_paths.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'research_agentic.policy'`.

- [ ] **Step 3: Write `policy.py`** (this slice — ported verbatim from the reference `tools.py`, with `_ca_authority_hosts` deferred to T4)

```python
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

from research_agentic.authority_hosts import DEFAULT_ALLOWED_HOSTS


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
```

- [ ] **Step 4: Run test to verify it passes** (will still fail until T3 creates `authority_hosts.py`, which `policy.py` imports)

Run: `cd research_agentic && python -m pytest tests/test_policy_paths.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'research_agentic.authority_hosts'`. **This is expected; T3 creates it.** (Do NOT inline-define the hosts here — keep the module boundary.) Proceed to T3, then re-run.

- [ ] **Step 5: Commit** (defer until T3 makes the import resolve — commit T2+T3 together at the end of T3)

---

## Task 3: `authority_hosts.py` — static CA authority host seed

**Files:**
- Create: `research_agentic/research_agentic/authority_hosts.py`
- Test: covered via `tests/test_authority_rank.py` (T4)

- [ ] **Step 1: Write `authority_hosts.py`** (greenfield replacement for the parent's `research_core.jurisdiction_registry.AIR_DISTRICTS` dependency — a static, already-normalized seed; expanded to the full registry-derived set in Phase 3's recall work)

```python
"""Known California EHS authority hostnames — the rank-1 source seed.

The parent derives air-district hosts from research_core.jurisdiction_registry; this
greenfield package does NOT depend on research_core, so the seed is static here. Hosts
are pre-normalized (lowercase, no leading 'www.', no trailing '.'). DEFAULT_ALLOWED_HOSTS
is the curated federal/state core; CA_AIR_DISTRICT_HOSTS adds district sites that live on
non-.gov TLDs (.org/.us/.net) which a naive government-TLD check would miss. Phase 3's
recall checklist expands CA_AIR_DISTRICT_HOSTS to the full ~35-district set (and may derive
it from the ported skills/*/program.json authority_source_url hosts).
"""

from __future__ import annotations

# Curated federal/state core (verbatim from parent tools.DEFAULT_ALLOWED_HOSTS).
DEFAULT_ALLOWED_HOSTS: tuple[str, ...] = (
    "aqmd.gov",
    "scaqmd.gov",
    "arb.ca.gov",
    "ca.gov",
    "epa.gov",
    "osha.gov",
    "govinfo.gov",
    "ecfr.gov",
    "law.cornell.edu",
)

# CA air-district sites on non-.gov TLDs (Phase 1 seed; expanded in Phase 3).
CA_AIR_DISTRICT_HOSTS: frozenset[str] = frozenset(
    {
        "vcapcd.org",
        "baaqmd.gov",
        "valleyair.org",
        "ourair.org",
        "slocleanair.org",
        "aqmd.gov",
    }
)


def ca_authority_hosts() -> frozenset[str]:
    """All known rank-1 authority hosts: the curated core UNION the CA air districts."""
    return frozenset(DEFAULT_ALLOWED_HOSTS) | CA_AIR_DISTRICT_HOSTS
```

- [ ] **Step 2: Verify the T2 path test now resolves the import**

Run: `cd research_agentic && python -m pytest tests/test_policy_paths.py -q`
Expected: PASS (T2's tests now import `policy` cleanly).

- [ ] **Step 3: Commit (T2 + T3 together)**

```bash
git add research_agentic/research_agentic/policy.py research_agentic/research_agentic/authority_hosts.py research_agentic/tests/test_policy_paths.py
git commit -m "feat(agentic): SandboxPolicy, path guards, result helpers, authority host seed"
```

---

## Task 4: `policy.py` — `host_fetchable` (SSRF) + `host_allowed` + `source_authority_rank`

**Files:**
- Modify: `research_agentic/research_agentic/policy.py` (append)
- Test: `research_agentic/tests/test_host_fetchable.py`, `research_agentic/tests/test_authority_rank.py`

- [ ] **Step 1: Write the failing tests** `tests/test_host_fetchable.py`

```python
import pytest

from research_agentic.policy import host_fetchable


@pytest.mark.parametrize("url", [
    "https://www.aqmd.gov/docs/rule.pdf",
    "http://vcapcd.org/rule23",
    "https://example.com/x",
    "https://8.8.8.8/x",
])
def test_public_hosts_are_fetchable(url):
    assert host_fetchable(url) is True


@pytest.mark.parametrize("url", [
    "ftp://aqmd.gov/x",                 # non-http scheme
    "http://localhost/x",
    "http://service.local/x",
    "http://api.internal/x",
    "http://127.0.0.1/x",               # loopback
    "http://10.0.0.5/x",                # private
    "http://192.168.1.1/x",            # private
    "http://169.254.169.254/latest",   # cloud metadata (link-local)
    "http://[::1]/x",                  # ipv6 loopback
    "not-a-url",
    "",
])
def test_ssrf_dangerous_targets_blocked(url):
    assert host_fetchable(url) is False


def test_non_string_blocked():
    assert host_fetchable(None) is False  # type: ignore[arg-type]
```

`tests/test_authority_rank.py`

```python
from research_agentic.policy import host_allowed, source_authority_rank


def test_rank1_curated_and_air_districts():
    assert source_authority_rank("https://www.aqmd.gov/docs/rule-201.pdf") == 1
    assert source_authority_rank("https://vcapcd.org/Rulebook/RULE23.pdf") == 1  # non-.gov authority


def test_rank2_other_gov():
    assert source_authority_rank("https://www.calrecycle.ca.gov/x") == 1  # ca.gov is curated -> 1
    assert source_authority_rank("https://www.ready.gov/x") == 2          # other .gov
    assert source_authority_rank("https://www.defense.mil/x") == 2


def test_rank3_non_authoritative():
    assert source_authority_rank("https://example.com/x") == 3
    assert source_authority_rank("https://medium.com/some-post") == 3


def test_spoof_suffix_not_substring():
    # aqmd.gov.evil.example ends in .example -> rank 3, never treated as government.
    assert source_authority_rank("https://aqmd.gov.evil.example/x") == 3


def test_host_allowed_suffix_match():
    assert host_allowed("https://sub.epa.gov/x") is True
    assert host_allowed("https://epa.gov.attacker.com/x") is False
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd research_agentic && python -m pytest tests/test_host_fetchable.py tests/test_authority_rank.py -q`
Expected: FAIL — `ImportError: cannot import name 'host_fetchable'`.

- [ ] **Step 3: Append to `policy.py`** (verbatim from reference `tools.py`, with `_ca_authority_hosts` sourced from `authority_hosts`)

```python
# ----- network SSRF guard + authority tiering (append to policy.py) -----

from urllib.parse import urlparse  # noqa: E402  (grouped with the network section)

from research_agentic.authority_hosts import ca_authority_hosts  # noqa: E402

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
```

> **Note for the implementer:** the two `# noqa: E402` mid-file imports keep this section self-contained for the port. If your linter forbids them, hoist `from urllib.parse import urlparse` and `from research_agentic.authority_hosts import ca_authority_hosts` to the top of `policy.py` alongside the existing imports — `ruff` is configured at line-length 100 only, so either form passes.

- [ ] **Step 4: Run to verify they pass**

Run: `cd research_agentic && python -m pytest tests/test_host_fetchable.py tests/test_authority_rank.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add research_agentic/research_agentic/policy.py research_agentic/tests/test_host_fetchable.py research_agentic/tests/test_authority_rank.py
git commit -m "feat(agentic): host_fetchable SSRF guard + source_authority_rank tiering"
```

---

## Task 5: `policy.py` — `_cap_text` + `_max_tool_chars`

**Files:**
- Modify: `research_agentic/research_agentic/policy.py` (append)
- Test: `research_agentic/tests/test_cap_text.py`

- [ ] **Step 1: Write the failing test** `tests/test_cap_text.py`

```python
import research_agentic.policy as policy
from research_agentic.policy import _cap_text, _max_tool_chars


def test_under_limit_passthrough():
    assert _cap_text("short") == "short"


def test_non_string_passthrough():
    assert _cap_text(123) == 123
    assert _cap_text(None) is None


def test_over_limit_truncates_with_marker(monkeypatch):
    monkeypatch.setenv("RESEARCH_CORE_MAX_TOOL_CHARS", "1000")
    text = "x" * 5000
    out = _cap_text(text)
    assert len(out) < 5000
    assert out.startswith("x" * 1000)
    assert "truncated 4000 of 5000 characters" in out


def test_env_override_floor(monkeypatch):
    monkeypatch.setenv("RESEARCH_CORE_MAX_TOOL_CHARS", "50")  # below the 1000 floor
    assert _max_tool_chars() == 1000


def test_default_cap(monkeypatch):
    monkeypatch.delenv("RESEARCH_CORE_MAX_TOOL_CHARS", raising=False)
    assert _max_tool_chars() == 16000
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd research_agentic && python -m pytest tests/test_cap_text.py -q`
Expected: FAIL — `ImportError: cannot import name '_cap_text'`.

- [ ] **Step 3: Append to `policy.py`** (verbatim from reference)

```python
# ----- per-tool output cap (append to policy.py) -----

def _max_tool_chars() -> int:
    """Per-tool-output character cap. The agent's full tool-output history accumulates in
    the model's context every turn, so a single uncapped fetch can blow a small-context
    worker's window. Override with RESEARCH_CORE_MAX_TOOL_CHARS (min 1000)."""
    import os

    raw = os.environ.get("RESEARCH_CORE_MAX_TOOL_CHARS")
    if raw:
        try:
            return max(1000, int(raw))
        except ValueError:
            pass
    return 16000


def _cap_text(text: Any) -> Any:
    """Truncate over-long tool output, leaving a marker so the agent knows to fetch a more
    specific page/section. Non-str inputs pass through unchanged."""
    if not isinstance(text, str):
        return text
    limit = _max_tool_chars()
    if len(text) <= limit:
        return text
    dropped = len(text) - limit
    return (
        text[:limit]
        + f"\n\n[...truncated {dropped} of {len(text)} characters to fit the model context — "
        "fetch a more specific URL/section, or read a particular SDS/page, if you need the rest...]"
    )
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd research_agentic && python -m pytest tests/test_cap_text.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add research_agentic/research_agentic/policy.py research_agentic/tests/test_cap_text.py
git commit -m "feat(agentic): per-tool output cap (_cap_text)"
```

---

## Task 6: `sandbox_tools/compute.py` — `compute_voc_threshold`

**Files:**
- Create: `research_agentic/research_agentic/sandbox_tools/__init__.py` (empty)
- Create: `research_agentic/research_agentic/sandbox_tools/compute.py`
- Test: `research_agentic/tests/test_compute_voc.py`

- [ ] **Step 1: Write the failing test** `tests/test_compute_voc.py` (the ALG-memo case: 200 lb ROC / 12 mo on a ~6.8 lb/gal VOC material → ~29 gal/yr)

```python
from research_agentic.sandbox_tools.compute import compute_voc_threshold


def test_mass_limit_to_usage_limit_alg_case():
    # ~6.8 lb VOC/gal material, 200 lb/period exemption threshold -> ~29 gal/period.
    out = compute_voc_threshold(voc_content=6.8, voc_content_unit="lb/gal", mass_limit_lb=200.0)
    assert out["ok"] is True
    assert out["usage_limit"]["gal"] == 29.41


def test_weight_percent_requires_density():
    out = compute_voc_threshold(voc_content=50.0, voc_content_unit="weight_percent")
    assert out["ok"] is False
    assert out["error"]["code"] == "density_required"


def test_weight_percent_with_density():
    out = compute_voc_threshold(voc_content=50.0, voc_content_unit="weight_percent", density=8.0, density_unit="lb/gal")
    assert out["ok"] is True
    assert out["voc_mass_per_volume"]["lb_per_gal"] == 4.0


def test_usage_to_emissions_with_control():
    out = compute_voc_threshold(voc_content=4.0, voc_content_unit="lb/gal", usage=100.0, usage_unit="gal", control_efficiency=0.5)
    assert out["ok"] is True
    assert out["emissions"]["lb"] == 200.0  # 100 gal * 4 lb/gal * (1 - 0.5)


def test_unknown_unit():
    out = compute_voc_threshold(voc_content=1.0, voc_content_unit="furlongs")
    assert out["ok"] is False and out["error"]["code"] == "unknown_unit"


def test_bad_control_efficiency():
    out = compute_voc_threshold(voc_content=1.0, voc_content_unit="lb/gal", control_efficiency=2.0)
    assert out["ok"] is False and out["error"]["code"] == "invalid_argument"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd research_agentic && python -m pytest tests/test_compute_voc.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'research_agentic.sandbox_tools'`.

- [ ] **Step 3: Create `sandbox_tools/__init__.py`** (empty) and **write `sandbox_tools/compute.py`** (verbatim from reference `tools.py`; pure math; uses policy result helpers)

```python
"""compute_voc_threshold — deterministic VOC/ROC permit-threshold calculator.

Ported verbatim from the parent repo's tools.compute_voc_threshold (PR #38). Pure math
(no network/filesystem): converts a mass-based rule limit (lb/period) into an equivalent
material-usage limit (gallons), or estimates emissions from usage. Runs inside the sandbox
but needs no policy.
"""

from __future__ import annotations

from typing import Any

from research_agentic.policy import _error, _invalid_argument, _success

# Exact NIST unit constants: 1 lb = 453.59237 g, 1 US gal = 3.785411784 L.
_G_PER_LB = 453.59237
_L_PER_GAL = 3.785411784
_G_PER_L_PER_LB_PER_GAL = _G_PER_LB / _L_PER_GAL  # 119.826427...

_MASS_PER_VOLUME_TO_LB_PER_GAL = {
    "lb/gal": 1.0,
    "lbs/gal": 1.0,
    "lb/gallon": 1.0,
    "g/l": 1.0 / _G_PER_L_PER_LB_PER_GAL,
    "mg/l": 0.001 / _G_PER_L_PER_LB_PER_GAL,
    "kg/l": 1000.0 / _G_PER_L_PER_LB_PER_GAL,
    "g/ml": 1000.0 / _G_PER_L_PER_LB_PER_GAL,
    "g/cm3": 1000.0 / _G_PER_L_PER_LB_PER_GAL,
    "g/cc": 1000.0 / _G_PER_L_PER_LB_PER_GAL,
}
_FRACTION_UNITS = {"weight_fraction": 1.0, "mass_fraction": 1.0, "fraction": 1.0}
_PERCENT_UNITS = {"weight_percent": 0.01, "wt%": 0.01, "wt %": 0.01, "percent": 0.01, "%": 0.01}
_GALLON_UNITS = {"gal", "gallon", "gallons", "us_gal"}
_LITER_UNITS = {"l", "liter", "liters", "litre", "litres"}


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def compute_voc_threshold(
    *,
    voc_content: float,
    voc_content_unit: str = "weight_percent",
    density: float | None = None,
    density_unit: str = "lb/gal",
    mass_limit_lb: float | None = None,
    usage: float | None = None,
    usage_unit: str = "gal",
    control_efficiency: float = 0.0,
) -> dict[str, Any]:
    if not _is_number(voc_content):
        return _invalid_argument("voc_content", "a number", voc_content)
    if not _is_number(control_efficiency):
        return _invalid_argument("control_efficiency", "a number between 0 and 1", control_efficiency)
    if control_efficiency < 0 or control_efficiency > 1:
        return _error("error", "invalid_argument", "control_efficiency must be between 0 and 1.", argument="control_efficiency")

    formula: list[str] = []
    unit = str(voc_content_unit).strip().lower()
    if unit in _MASS_PER_VOLUME_TO_LB_PER_GAL:
        voc_lb_per_gal = voc_content * _MASS_PER_VOLUME_TO_LB_PER_GAL[unit]
        formula.append(f"VOC concentration {voc_content} {voc_content_unit} = {voc_lb_per_gal:.4g} lb VOC/gal")
    elif unit in _FRACTION_UNITS or unit in _PERCENT_UNITS:
        scale = _FRACTION_UNITS.get(unit, _PERCENT_UNITS.get(unit, 1.0))
        fraction = voc_content * scale
        if not _is_number(density):
            return _error("error", "density_required",
                          "A material density is required to convert a weight fraction/percent to VOC mass per volume.",
                          argument="density")
        dunit = str(density_unit).strip().lower()
        if dunit not in _MASS_PER_VOLUME_TO_LB_PER_GAL:
            return _error("error", "unknown_unit", f"Unknown density unit: {density_unit!r}.", argument="density_unit")
        density_lb_per_gal = density * _MASS_PER_VOLUME_TO_LB_PER_GAL[dunit]
        voc_lb_per_gal = fraction * density_lb_per_gal
        formula.append(
            f"VOC mass/vol = {fraction:g} (fraction) x {density_lb_per_gal:.4g} lb/gal density = {voc_lb_per_gal:.4g} lb VOC/gal"
        )
    else:
        return _error("error", "unknown_unit", f"Unknown voc_content_unit: {voc_content_unit!r}.", argument="voc_content_unit")

    if voc_lb_per_gal <= 0:
        return _error("error", "invalid_argument", "Computed VOC mass per volume must be positive.", argument="voc_content")

    control_factor = 1.0 - control_efficiency
    effective = voc_lb_per_gal * control_factor

    result: dict[str, Any] = {
        "voc_mass_per_volume": {
            "lb_per_gal": round(voc_lb_per_gal, 4),
            "g_per_l": round(voc_lb_per_gal * _G_PER_L_PER_LB_PER_GAL, 2),
        },
        "control_efficiency": control_efficiency,
        "effective_voc_lb_per_gal": round(effective, 4),
        "inputs": {
            "voc_content": voc_content,
            "voc_content_unit": voc_content_unit,
            "density": density,
            "density_unit": density_unit if density is not None else None,
            "mass_limit_lb": mass_limit_lb,
            "usage": usage,
            "usage_unit": usage_unit if usage is not None else None,
        },
    }

    if mass_limit_lb is not None:
        if not _is_number(mass_limit_lb) or mass_limit_lb <= 0:
            return _invalid_argument("mass_limit_lb", "a positive number", mass_limit_lb)
        usage_limit_gal = mass_limit_lb / effective
        result["usage_limit"] = {"gal": round(usage_limit_gal, 2), "l": round(usage_limit_gal * _L_PER_GAL, 2)}
        ctl = f" x (1 - {control_efficiency} control)" if control_efficiency else ""
        formula.append(
            f"usage_limit = {mass_limit_lb} lb / ({voc_lb_per_gal:.4g} lb/gal{ctl}) = {usage_limit_gal:.2f} gal per period"
        )

    if usage is not None:
        if not _is_number(usage) or usage < 0:
            return _invalid_argument("usage", "a non-negative number", usage)
        uunit = str(usage_unit).strip().lower()
        if uunit in _GALLON_UNITS:
            usage_gal = float(usage)
        elif uunit in _LITER_UNITS:
            usage_gal = usage / _L_PER_GAL
        else:
            return _error("error", "unknown_unit", f"Unknown usage_unit: {usage_unit!r}.", argument="usage_unit")
        emissions_lb = usage_gal * effective
        result["emissions"] = {"lb": round(emissions_lb, 2), "usage_gal": round(usage_gal, 4)}
        ctl = f" x (1 - {control_efficiency} control)" if control_efficiency else ""
        formula.append(
            f"emissions = {usage_gal:.4g} gal x {voc_lb_per_gal:.4g} lb/gal{ctl} = {emissions_lb:.2f} lb VOC/ROC"
        )

    result["formula"] = formula
    return _success("computed", **result)
```

- [ ] **Step 4: Run to verify it passes** (and confirm the ALG numeric: `200 / 6.8 = 29.41`)

Run: `cd research_agentic && python -m pytest tests/test_compute_voc.py -q`
Expected: PASS (6 passed). If `usage_limit.gal` differs, recompute the expected constant — do NOT change the formula.

- [ ] **Step 5: Commit**

```bash
git add research_agentic/research_agentic/sandbox_tools/__init__.py research_agentic/research_agentic/sandbox_tools/compute.py research_agentic/tests/test_compute_voc.py
git commit -m "feat(agentic): port compute_voc_threshold calculator"
```

---

## Task 7: `sandbox_tools/artifacts.py` — `write_artifact` + `submit_finding`

**Files:**
- Create: `research_agentic/research_agentic/sandbox_tools/artifacts.py`
- Test: `research_agentic/tests/test_artifacts.py`

- [ ] **Step 1: Write the failing test** `tests/test_artifacts.py`

```python
import json
from pathlib import Path

from research_agentic.policy import SandboxPolicy
from research_agentic.sandbox_tools.artifacts import submit_finding, write_artifact


def _policy(tmp_path: Path) -> SandboxPolicy:
    return SandboxPolicy(run_id="run-1", artifact_root=tmp_path)


def test_write_artifact_within_workspace(tmp_path):
    out = write_artifact(_policy(tmp_path), "notes/a.txt", "hello")
    assert out["ok"] is True
    assert out["bytes_written"] == 5
    assert Path(out["path"]).read_text() == "hello"


def test_write_artifact_blocks_traversal(tmp_path):
    out = write_artifact(_policy(tmp_path), "../escape.txt", "x")
    assert out["ok"] is False and out["error"]["code"] == "path_traversal"


def test_submit_finding_writes_json(tmp_path):
    out = submit_finding(
        _policy(tmp_path),
        title="Rule 23 exemption applies",
        summary="Under 200 lb ROC/yr.",
        sources=["https://www.vcapcd.org/RULE23.pdf"],
        confidence=0.8,
    )
    assert out["ok"] is True
    finding = json.loads(Path(out["artifact_path"]).read_text())
    assert finding["title"] == "Rule 23 exemption applies"
    assert finding["sources"] == ["https://www.vcapcd.org/RULE23.pdf"]


def test_submit_finding_rejects_ssrf_source(tmp_path):
    out = submit_finding(_policy(tmp_path), title="t", summary="s",
                         sources=["http://169.254.169.254/latest"], confidence=0.5)
    assert out["ok"] is False and out["error"]["code"] == "host_not_allowed"


def test_submit_finding_validates_confidence(tmp_path):
    out = submit_finding(_policy(tmp_path), title="t", summary="s", sources=[], confidence=2.0)
    assert out["ok"] is False and out["error"]["code"] == "invalid_confidence"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd research_agentic && python -m pytest tests/test_artifacts.py -q`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write `sandbox_tools/artifacts.py`** (verbatim from reference `tools.py`: `write_artifact`, `_validate_sources`, `_slug`, `submit_finding`)

```python
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
            path.write_text(contents)
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd research_agentic && python -m pytest tests/test_artifacts.py -q`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add research_agentic/research_agentic/sandbox_tools/artifacts.py research_agentic/tests/test_artifacts.py
git commit -m "feat(agentic): port write_artifact + submit_finding"
```

---

## Task 8: `sandbox_tools/documents.py` — `read_pdf` / `read_docx` / `read_spreadsheet`

**Files:**
- Create: `research_agentic/research_agentic/sandbox_tools/documents.py`
- Test: `research_agentic/tests/test_documents.py`

> The host/test env does NOT install `fitz`/`docx`/`openpyxl`. Tests cover the dep-free path (CSV), the path guards, and the `dependency_missing` branch for PDF/DOCX/XLSX. Real PDF/DOCX/XLSX parsing is exercised in the sandbox (its image installs these) via the live smoke and Phase 2.

- [ ] **Step 1: Write the failing test** `tests/test_documents.py`

```python
from pathlib import Path

from research_agentic.policy import SandboxPolicy
from research_agentic.sandbox_tools.documents import read_pdf, read_spreadsheet


def _policy(tmp_path: Path) -> SandboxPolicy:
    ws = tmp_path / "run-1"
    ws.mkdir(parents=True, exist_ok=True)
    return SandboxPolicy(run_id="run-1", artifact_root=tmp_path)


def test_read_csv_dep_free(tmp_path):
    pol = _policy(tmp_path)
    (Path(pol.artifact_root) / "run-1" / "data.csv").write_text("a,b\n1,2\n")
    out = read_spreadsheet(pol, "data.csv")
    assert out["ok"] is True
    assert out["sheets"][0]["rows"] == [["a", "b"], ["1", "2"]]
    assert "a\tb" in out["text"]


def test_file_not_found(tmp_path):
    out = read_spreadsheet(_policy(tmp_path), "missing.csv")
    assert out["ok"] is False and out["error"]["code"] == "file_not_found"


def test_path_traversal_blocked(tmp_path):
    out = read_pdf(_policy(tmp_path), "../../etc/passwd")
    assert out["ok"] is False and out["error"]["code"] == "path_traversal"


def test_read_pdf_dependency_missing_when_fitz_absent(tmp_path):
    # On the host test env PyMuPDF is not installed; a real (but unparseable) file path
    # that EXISTS should report dependency_missing, not file_not_found.
    pol = _policy(tmp_path)
    (Path(pol.artifact_root) / "run-1" / "x.pdf").write_bytes(b"%PDF-1.4 fake")
    out = read_pdf(pol, "x.pdf")
    # Either dependency_missing (no fitz) or read (fitz present) — both are acceptable;
    # assert it is NOT a false file_not_found / traversal error.
    assert out["error"]["code"] != "file_not_found" if not out["ok"] else out["ok"]
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd research_agentic && python -m pytest tests/test_documents.py -q`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write `sandbox_tools/documents.py`** (verbatim from reference `documents.py`, imports re-homed to `..policy`)

```python
"""read_pdf / read_docx / read_spreadsheet — run-workspace document readers.

Ported verbatim from the parent repo's documents.py (PR #38). Heavy parsers (PyMuPDF,
python-docx, openpyxl) are import-guarded — when absent they return a structured
'dependency_missing' result rather than raising. CSV needs no third-party dep. All paths
are guarded through _resolve_workspace_path and capped via _cap_text.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from research_agentic.policy import (
    SandboxPolicy,
    _cap_text,
    _error,
    _exception_error,
    _resolve_workspace_path,
    _success,
)


def _path_or_error(policy: SandboxPolicy, path: str | Path) -> Path | dict[str, Any]:
    try:
        resolved = _resolve_workspace_path(policy, path)
    except TypeError as exc:
        return _error("error", "invalid_argument", str(exc), path=str(path))
    except ValueError as exc:
        return _error("error", "path_traversal", str(exc), path=str(path))
    if not resolved.exists():
        return _error("error", "file_not_found", "Document does not exist.", path=str(path))
    if not resolved.is_file():
        return _error("error", "not_a_file", "Document path is not a file.", path=str(path))
    return resolved


def read_pdf(policy: SandboxPolicy, path: str | Path) -> dict[str, Any]:
    checked = _path_or_error(policy, path)
    if isinstance(checked, dict):
        return checked
    try:
        import fitz
    except ImportError:
        return _error("unavailable", "dependency_missing", "PyMuPDF is not installed.", dependency="pymupdf")
    try:
        pages: list[dict[str, Any]] = []
        with fitz.open(checked) as document:
            for index, page in enumerate(document):
                pages.append({"page": index + 1, "text": page.get_text("text")})
        return _success("read", path=str(checked), page_count=len(pages),
                        text=_cap_text("\n".join(page["text"] for page in pages)), pages=pages)
    except Exception as exc:
        return _exception_error("pdf_read_failed", exc, path=str(checked))


def read_docx(policy: SandboxPolicy, path: str | Path) -> dict[str, Any]:
    checked = _path_or_error(policy, path)
    if isinstance(checked, dict):
        return checked
    try:
        import docx
    except ImportError:
        return _error("unavailable", "dependency_missing", "python-docx is not installed.", dependency="python-docx")
    try:
        document = docx.Document(str(checked))
        paragraphs = [paragraph.text for paragraph in document.paragraphs]
        tables = [[[cell.text for cell in row.cells] for row in table.rows] for table in document.tables]
        return _success("read", path=str(checked), text=_cap_text("\n".join(paragraphs)),
                        paragraphs=paragraphs, tables=tables)
    except Exception as exc:
        return _exception_error("docx_read_failed", exc, path=str(checked))


def read_spreadsheet(policy: SandboxPolicy, path: str | Path) -> dict[str, Any]:
    checked = _path_or_error(policy, path)
    if isinstance(checked, dict):
        return checked
    suffix = checked.suffix.lower()
    if suffix == ".csv":
        return _read_csv(checked)
    if suffix in {".xlsx", ".xlsm"}:
        return _read_xlsx(checked)
    return _error("error", "unsupported_spreadsheet", "Unsupported spreadsheet format.", path=str(checked), suffix=suffix)


def _read_csv(path: Path) -> dict[str, Any]:
    try:
        with path.open(newline="") as handle:
            rows = list(csv.reader(handle))
        return _success("read", path=str(path), sheets=[{"name": path.stem, "rows": rows}], text=_cap_text(_rows_to_text(rows)))
    except Exception as exc:
        return _exception_error("csv_read_failed", exc, path=str(path))


def _read_xlsx(path: Path) -> dict[str, Any]:
    try:
        import openpyxl
    except ImportError:
        return _error("unavailable", "dependency_missing", "openpyxl is not installed.", dependency="openpyxl")
    try:
        workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
        sheets = []
        for sheet in workbook.worksheets:
            rows = [list(row) for row in sheet.iter_rows(values_only=True)]
            sheets.append({"name": sheet.title, "rows": rows})
        workbook.close()
        return _success("read", path=str(path), sheets=sheets,
                        text=_cap_text("\n\n".join(_rows_to_text(sheet["rows"]) for sheet in sheets)))
    except Exception as exc:
        return _exception_error("spreadsheet_read_failed", exc, path=str(path))


def _rows_to_text(rows: list[list[Any]]) -> str:
    return "\n".join("\t".join("" if cell is None else str(cell) for cell in row) for row in rows)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd research_agentic && python -m pytest tests/test_documents.py -q`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add research_agentic/research_agentic/sandbox_tools/documents.py research_agentic/tests/test_documents.py
git commit -m "feat(agentic): port read_pdf/read_docx/read_spreadsheet"
```

---

## Task 9: `sandbox_tools/web.py` — extraction + `web_fetch` + `web_search`

**Files:**
- Create: `research_agentic/research_agentic/sandbox_tools/web.py`
- Test: `research_agentic/tests/test_web.py`

> `web_fetch` is the most important and most-tested tool. Tests monkeypatch `httpx.Client` with a fake (no network). `fitz`/`bs4` are absent on the host, so the PDF path falls through to text and HTML de-chroming is a no-op — tests assert accordingly.

- [ ] **Step 1: Write the failing test** `tests/test_web.py`

```python
import httpx

from research_agentic.policy import SandboxPolicy
from research_agentic.sandbox_tools import web
from research_agentic.sandbox_tools.web import web_fetch


def _policy() -> SandboxPolicy:
    from pathlib import Path
    return SandboxPolicy(run_id="r", artifact_root=Path("/tmp"))


class _Resp:
    def __init__(self, status=200, headers=None, text="", content=b"", url="https://www.aqmd.gov/x"):
        self.status_code = status
        self.headers = headers or {"content-type": "text/plain"}
        self.text = text
        self.content = content
        self.url = url

    @property
    def is_success(self):
        return 200 <= self.status_code < 300


class _FakeClient:
    """Stand-in for httpx.Client: returns a queued response per .get() call."""
    def __init__(self, responses, **kwargs):
        self._responses = list(responses)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get(self, url, params=None):
        return self._responses.pop(0)


def _patch_client(monkeypatch, responses):
    monkeypatch.setattr(httpx, "Client", lambda **kw: _FakeClient(responses))


def test_web_fetch_plain_text(monkeypatch):
    _patch_client(monkeypatch, [_Resp(text="Rule 201 requires a Permit to Construct.")])
    out = web_fetch(_policy(), "https://www.aqmd.gov/rule-201")
    assert out["ok"] is True
    assert "Permit to Construct" in out["text"]
    assert out["status_code"] == 200


def test_web_fetch_blocks_ssrf():
    out = web_fetch(_policy(), "http://169.254.169.254/latest/meta-data")
    assert out["ok"] is False and out["error"]["code"] == "host_not_fetchable"


def test_web_fetch_network_disabled():
    from pathlib import Path
    pol = SandboxPolicy(run_id="r", artifact_root=Path("/tmp"), allow_network=False)
    out = web_fetch(pol, "https://www.aqmd.gov/x")
    assert out["ok"] is False and out["error"]["code"] == "network_disabled"


def test_web_fetch_redirect_to_private_blocked(monkeypatch):
    redirect = _Resp(status=302, headers={"location": "http://10.0.0.1/secret", "content-type": "text/html"})
    _patch_client(monkeypatch, [redirect])
    out = web_fetch(_policy(), "https://www.aqmd.gov/go")
    assert out["ok"] is False and out["error"]["code"] == "redirect_blocked"


def test_web_fetch_pdf_magic_bytes_without_fitz_falls_through(monkeypatch):
    # %PDF magic but no PyMuPDF on host -> _extract_pdf_text returns None -> text path.
    pdf = _Resp(headers={"content-type": "application/pdf"}, content=b"%PDF-1.4 ...", text="")
    _patch_client(monkeypatch, [pdf])
    out = web_fetch(_policy(), "https://www.aqmd.gov/rule.pdf")
    assert out["ok"] is True
    assert out.get("extracted_format") != "pdf"  # fell through (no fitz on host)


def test_web_search_unavailable_without_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    out = web.web_search(_policy(), "graphic arts permit ventura county")
    assert out["ok"] is False
    assert out["error"]["code"] in {"search_provider_unavailable", "search_dependency_missing"}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd research_agentic && python -m pytest tests/test_web.py -q`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write `sandbox_tools/web.py`** (verbatim from reference `tools.py`; `_extract_pdf_text`/`_extract_main_text`/`_looks_bot_blocked`/`_guarded_get`/`_browser_fallback`/`web_fetch`/`_openai_web_search`/`web_search`. The `web ↔ browser` cycle is broken by a lazy `from .browser import browser_use` inside `_browser_fallback`.)

```python
"""web_fetch + web_search — open-discovery network tools (run inside the sandbox).

Ported from the parent repo's tools.py (PR #38). web_fetch follows redirects under the
SSRF guard, extracts PDF text (PyMuPDF) and HTML main content (BeautifulSoup), caps the
output, and falls back to the headless browser on a Cloudflare bot-block. web_search does
real open web discovery via the OpenAI Responses web_search tool (no host restriction;
authority is judged downstream). Heavy deps are import-guarded.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

from research_agentic.policy import (
    MAX_REDIRECT_HOPS,
    REDIRECT_STATUS_CODES,
    SandboxPolicy,
    _cap_text,
    _error,
    _exception_error,
    _invalid_argument,
    _success,
    host_allowed,
    host_fetchable,
    source_authority_rank,
)


def _extract_pdf_text(data: bytes) -> str | None:
    if not isinstance(data, (bytes, bytearray)) or not data:
        return None
    try:
        import fitz
    except ImportError:
        return None
    try:
        with fitz.open(stream=bytes(data), filetype="pdf") as document:
            text = "\n".join(page.get_text("text") for page in document)
        return text or None
    except Exception:  # noqa: BLE001 — not a parseable PDF; let caller fall back
        return None


def _extract_main_text(html: str) -> str:
    try:
        import re

        from bs4 import BeautifulSoup
    except ImportError:
        return html
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg", "button"]):
        tag.decompose()
    main = soup.find("main") or soup.find("article") or soup.find(attrs={"role": "main"})
    text = main.get_text("\n", strip=True) if main else ""
    if len(text) < 400:
        text = (soup.body or soup).get_text("\n", strip=True)
    return re.sub(r"\n{3,}", "\n\n", text)


_BOT_BLOCK_STATUS = {403, 429, 503}
_BOT_BLOCK_BODY_MARKERS = (
    "just a moment",
    "cf-browser-verification",
    "challenge-platform",
    "attention required",
    "enable javascript and cookies",
    "_cf_chl",
)


def _looks_bot_blocked(response: Any) -> bool:
    if getattr(response, "status_code", None) not in _BOT_BLOCK_STATUS:
        return False
    headers = {str(k).lower(): str(v).lower() for k, v in dict(getattr(response, "headers", {})).items()}
    if "cf-ray" in headers or "cf-mitigated" in headers or "cloudflare" in headers.get("server", ""):
        return True
    try:
        body = (response.text or "")[:4000].lower()
    except Exception:  # noqa: BLE001
        return False
    return any(marker in body for marker in _BOT_BLOCK_BODY_MARKERS)


def _header(response: Any, name: str) -> str | None:
    headers = getattr(response, "headers", {})
    return headers.get(name) or headers.get(name.lower()) or headers.get(name.title())


def _is_redirect(response: Any) -> bool:
    return getattr(response, "status_code", None) in REDIRECT_STATUS_CODES and bool(_header(response, "location"))


def _guarded_get(
    policy: SandboxPolicy,
    client: Any,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
) -> tuple[Any | None, dict[str, Any] | None, list[dict[str, Any]]]:
    current_url = url
    redirect_chain: list[dict[str, Any]] = []
    context = context or {}
    for hop in range(MAX_REDIRECT_HOPS + 1):
        response = client.get(current_url, params=params if hop == 0 else None)
        status_code = getattr(response, "status_code", None)
        chain_entry = {"url": current_url, "status_code": status_code}
        redirect_chain.append(chain_entry)
        if not _is_redirect(response):
            return response, None, redirect_chain
        raw_location = _header(response, "location")
        next_url = urljoin(str(getattr(response, "url", current_url)), raw_location or "")
        chain_entry["location"] = next_url
        if not host_fetchable(next_url):
            return (None, _error("blocked", "redirect_blocked",
                                 "Redirect target is not a fetchable public host (SSRF guard).",
                                 redirect_chain=redirect_chain, blocked_url=next_url, **context), redirect_chain)
        current_url = next_url
    return (None, _error("error", "redirect_limit_exceeded", "Redirect hop limit exceeded.",
                         redirect_chain=redirect_chain, **context), redirect_chain)


def _browser_fallback(policy: SandboxPolicy, url: str, *, redirect_chain: list[dict[str, Any]], original_url: str) -> dict[str, Any] | None:
    try:
        from research_agentic.sandbox_tools.browser import browser_use  # lazy: breaks web<->browser cycle
        result = browser_use(policy, url)
    except Exception:  # noqa: BLE001 — browser is best-effort; fall through on any error
        return None
    if not isinstance(result, dict) or not result.get("ok"):
        return None
    snapshot = result.get("snapshot") or {}
    return _success("fetched", url=original_url, final_url=snapshot.get("url", url),
                    status_code=snapshot.get("status_code"), content_type=snapshot.get("content_type", "text/html"),
                    text=_cap_text(snapshot.get("text", "")), via="browser_fallback", redirect_chain=redirect_chain)


def web_fetch(policy: SandboxPolicy, url: str) -> dict[str, Any]:
    if not isinstance(url, str):
        return _invalid_argument("url", "a string", url)
    if not policy.allow_network:
        return _error("blocked", "network_disabled", "Network access is disabled by sandbox policy.", url=url)
    if not host_fetchable(url):
        return _error("blocked", "host_not_fetchable", "URL is not a fetchable public host (SSRF guard).", url=url)
    try:
        import httpx
    except ImportError:
        return _error("unavailable", "dependency_missing", "httpx is not installed.", dependency="httpx")
    try:
        with httpx.Client(follow_redirects=False, timeout=policy.timeout_seconds) as client:
            response, redirect_error, redirect_chain = _guarded_get(policy, client, url, context={"url": url})
        if redirect_error is not None:
            return redirect_error
        final_url = str(response.url)
        if not host_fetchable(final_url):
            return _error("blocked", "redirect_blocked", "Fetch redirected to a non-fetchable public host (SSRF guard).",
                          url=url, final_url=final_url)
        content_type = response.headers.get("content-type")
        ctype = (content_type or "").lower()
        if not response.is_success and policy.allow_browser and _looks_bot_blocked(response):
            fallback = _browser_fallback(policy, final_url, redirect_chain=redirect_chain, original_url=url)
            if fallback is not None:
                return fallback
        body_bytes = response.content if response.is_success else b""
        is_pdf = ("pdf" in ctype) or (body_bytes[:5].startswith(b"%PDF"))
        if is_pdf and body_bytes:
            extracted = _extract_pdf_text(body_bytes)
            if extracted is not None:
                return _success("fetched", url=url, final_url=final_url, status_code=response.status_code,
                                content_type=content_type or "application/pdf", text=_cap_text(extracted),
                                extracted_format="pdf", headers=dict(response.headers), redirect_chain=redirect_chain)
        raw = response.text if response.is_success else ""
        is_html = "html" in ctype or (raw[:512].lstrip().lower().startswith(("<!doctype html", "<html")))
        text = _extract_main_text(raw) if (is_html and raw) else raw
        return _success("fetched" if response.is_success else "http_error", url=url, final_url=final_url,
                        status_code=response.status_code, content_type=content_type, text=_cap_text(text),
                        headers=dict(response.headers), redirect_chain=redirect_chain)
    except Exception as exc:
        return _exception_error("fetch_failed", exc, url=url)


def _openai_web_search(query: str, *, limit: int = 5) -> dict[str, Any]:
    import os

    try:
        from openai import OpenAI
    except ImportError:
        return _error("unavailable", "search_dependency_missing", "openai is not installed.", query=query)
    if not os.environ.get("OPENAI_API_KEY"):
        return _error("unavailable", "search_provider_unavailable", "No OPENAI_API_KEY configured for web search.", query=query)
    model = os.environ.get("RESEARCH_CORE_AGENT_MODEL") or "gpt-5.5"
    instruction = ("Find official primary sources that answer this California EHS permit question. "
                   "Prefer government/authority sites. Question: " + query)
    resp = None
    client = OpenAI(timeout=45.0, max_retries=1)
    for tool_type in ("web_search", "web_search_preview"):
        try:
            resp = client.responses.create(model=model, tools=[{"type": tool_type}], input=instruction)
            break
        except Exception:  # noqa: BLE001
            resp = None
    if resp is None:
        return _error("unavailable", "search_failed", "Web search call failed.", query=query)
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in (getattr(resp, "output", None) or []):
        for content in (getattr(item, "content", None) or []):
            for ann in (getattr(content, "annotations", None) or []):
                u = getattr(ann, "url", None)
                if not u or u in seen or not host_fetchable(u):
                    continue
                seen.add(u)
                results.append({"url": u, "title": getattr(ann, "title", "") or "", "authority_rank": source_authority_rank(u)})
                if len(results) >= max(1, limit):
                    break
    return _success("searched", query=query, results=results)


def web_search(policy: SandboxPolicy, query: str, *, limit: int = 5) -> dict[str, Any]:
    if not isinstance(query, str):
        return _invalid_argument("query", "a string", query)
    if not isinstance(limit, int) or isinstance(limit, bool):
        return _invalid_argument("limit", "an integer", limit)
    if not policy.allow_network:
        return _error("blocked", "network_disabled", "Network access is disabled by sandbox policy.", query=query)
    if not query.strip():
        return _error("error", "empty_query", "Search query must not be empty.", query=query)
    if policy.search_endpoint is None:
        return _openai_web_search(query, limit=limit)
    if not isinstance(policy.search_endpoint, str):
        return _invalid_argument("search_endpoint", "a string", policy.search_endpoint)
    if not host_allowed(policy.search_endpoint, policy.allowed_hosts):
        return _error("blocked", "host_not_allowed", "Search endpoint host is not allowed by sandbox policy.",
                      endpoint=policy.search_endpoint)
    try:
        import httpx
    except ImportError:
        return _error("unavailable", "dependency_missing", "httpx is not installed.", dependency="httpx")
    try:
        with httpx.Client(follow_redirects=False, timeout=policy.timeout_seconds) as client:
            response, redirect_error, redirect_chain = _guarded_get(
                policy, client, policy.search_endpoint, params={"q": query, "limit": limit},
                context={"query": query, "endpoint": policy.search_endpoint})
        if redirect_error is not None:
            return redirect_error
        final_url = str(response.url)
        if not host_allowed(final_url, policy.allowed_hosts):
            return _error("blocked", "redirect_host_not_allowed", "Search redirected to a host outside sandbox policy.",
                          endpoint=policy.search_endpoint, final_url=final_url)
        content_type = response.headers.get("content-type", "")
        results: Any = response.json() if "json" in content_type else response.text
        return _success("searched" if response.is_success else "http_error", query=query,
                        endpoint=policy.search_endpoint, final_url=final_url, status_code=response.status_code,
                        results=results, redirect_chain=redirect_chain)
    except Exception as exc:
        return _exception_error("search_failed", exc, query=query, endpoint=policy.search_endpoint)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd research_agentic && python -m pytest tests/test_web.py -q`
Expected: PASS (6 passed). `httpx` must be importable in the test env (it is a host dep from T1).

- [ ] **Step 5: Commit**

```bash
git add research_agentic/research_agentic/sandbox_tools/web.py research_agentic/tests/test_web.py
git commit -m "feat(agentic): port web_fetch + web_search (SSRF-guarded open discovery)"
```

---

## Task 10: `sandbox_tools/browser.py` — `browser_use`

**Files:**
- Create: `research_agentic/research_agentic/sandbox_tools/browser.py`
- Test: `research_agentic/tests/test_browser.py`

> Playwright is NOT installed on the host (Phase 2 adds it to the sandbox image). Phase 1 tests cover the guard paths + the `dependency_missing` branch. The real Playwright flow is validated live in Phase 2.

- [ ] **Step 1: Write the failing test** `tests/test_browser.py`

```python
from pathlib import Path

from research_agentic.policy import SandboxPolicy
from research_agentic.sandbox_tools.browser import browser_use


def _policy(**kw) -> SandboxPolicy:
    return SandboxPolicy(run_id="r", artifact_root=Path("/tmp"), **kw)


def test_browser_disabled():
    out = browser_use(_policy(allow_browser=False), "https://www.aqmd.gov/x")
    assert out["ok"] is False and out["error"]["code"] == "browser_disabled"


def test_browser_ssrf_blocked():
    out = browser_use(_policy(), "http://127.0.0.1/x")
    assert out["ok"] is False and out["error"]["code"] == "host_not_fetchable"


def test_browser_dependency_missing_when_playwright_absent():
    # Host has no playwright -> dependency_missing (NOT a crash).
    out = browser_use(_policy(), "https://www.aqmd.gov/x")
    assert out["ok"] is False
    assert out["error"]["code"] in {"dependency_missing", "browser_failed"}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd research_agentic && python -m pytest tests/test_browser.py -q`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write `sandbox_tools/browser.py`** (verbatim from reference `browser.py`; `_extract_pdf_text` lazily imported from `.web` inside `_pdf_text_via_browser` to break the cycle)

```python
"""browser_use — guarded headless-browser navigation (Playwright; runs inside the sandbox).

Ported from the parent repo's browser.py (PR #38). Every request is route-guarded by
host_fetchable, service workers are blocked, the final URL is re-checked, and a PDF landed
on by the browser is extracted through the browser's own request context. Playwright is
import-guarded (Phase 2 installs it + chromium in the sandbox image).
"""

from __future__ import annotations

from typing import Any

from research_agentic.policy import (
    SandboxPolicy,
    _error,
    _exception_error,
    _invalid_argument,
    _success,
    host_fetchable,
)


def _pdf_text_via_browser(context: Any, response: Any, final_url: str) -> str | None:
    content_type = ""
    try:
        headers = getattr(response, "headers", None) or {}
        content_type = (headers.get("content-type") or "").lower()
    except Exception:  # noqa: BLE001
        content_type = ""
    path = final_url.lower().split("?", 1)[0]
    if "pdf" not in content_type and not path.endswith(".pdf"):
        return None
    try:
        api_response = context.request.get(final_url)
        data = api_response.body()
    except Exception:  # noqa: BLE001
        return None
    from research_agentic.sandbox_tools.web import _extract_pdf_text  # lazy: breaks browser<->web cycle

    return _extract_pdf_text(data)


def browser_use(policy: SandboxPolicy, url: str, *, wait_until: str = "domcontentloaded") -> dict[str, Any]:
    if not isinstance(url, str):
        return _invalid_argument("url", "a string", url)
    if not policy.allow_browser:
        return _error("blocked", "browser_disabled", "Browser access is disabled by sandbox policy.", url=url)
    if not host_fetchable(url):
        return _error("blocked", "host_not_fetchable", "URL is not a fetchable public host (SSRF guard).", url=url)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return _error("unavailable", "dependency_missing", "playwright is not installed.", dependency="playwright")
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = None
            try:
                blocked_requests: list[dict[str, Any]] = []

                def guard_route(route: Any, request: Any) -> None:
                    request_url = getattr(request, "url", "")
                    if host_fetchable(request_url):
                        route.continue_()
                        return
                    blocked_requests.append({"url": request_url, "resource_type": getattr(request, "resource_type", None)})
                    route.abort()

                context = browser.new_context(service_workers="block")
                context.route("**/*", guard_route)
                page = context.new_page()
                try:
                    response = page.goto(url, wait_until=wait_until, timeout=int(policy.timeout_seconds * 1000))
                except Exception:
                    if blocked_requests:
                        return _error("blocked", "resource_blocked", "Browser blocked a request outside sandbox policy.",
                                      url=url, blocked_url=blocked_requests[0]["url"], blocked_requests=blocked_requests)
                    raise
                if blocked_requests:
                    return _error("blocked", "resource_blocked", "Browser blocked a request outside sandbox policy.",
                                  url=url, blocked_url=blocked_requests[0]["url"], blocked_requests=blocked_requests)
                final_url = page.url
                if not host_fetchable(final_url):
                    return _error("blocked", "redirect_blocked", "Browser navigation reached a host outside sandbox policy.",
                                  url=url, final_url=final_url)
                pdf_text = _pdf_text_via_browser(context, response, final_url)
                if pdf_text:
                    snapshot = {"url": final_url, "title": page.title(), "text": pdf_text,
                                "status_code": response.status if response is not None else None,
                                "content_type": "application/pdf"}
                else:
                    body = page.locator("body")
                    snapshot = {"url": final_url, "title": page.title(),
                                "text": body.inner_text(timeout=int(policy.timeout_seconds * 1000)) if body.count() else "",
                                "status_code": response.status if response is not None else None}
            finally:
                if context is not None:
                    context.close()
                browser.close()
        return _success("navigated", snapshot=snapshot)
    except Exception as exc:
        return _exception_error("browser_failed", exc, url=url)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd research_agentic && python -m pytest tests/test_browser.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add research_agentic/research_agentic/sandbox_tools/browser.py research_agentic/tests/test_browser.py
git commit -m "feat(agentic): port browser_use (guarded Playwright nav)"
```

---

## Task 11: Port the `skills/` law-code library (26 programs)

**Files:**
- Create: `research_agentic/research_agentic/skills/<id>/SKILL.md` + `program.json` (×26), copied from the parent.

> Done by a one-time clone of the parent at the pinned SHA (NOT a slow per-file `gh api` fan-out), then a local copy. This also brings the `program.json` files that Phase 3's recall checklist will read as reference data.

- [ ] **Step 1: Clone the parent at the pinned SHA into a temp dir**

```bash
rm -rf /tmp/parent-antler && git clone --no-checkout --depth 1 https://github.com/a1gmm/Autoresearch-Systems-Hackathon-Antler.git /tmp/parent-antler 2>/dev/null || git clone https://github.com/a1gmm/Autoresearch-Systems-Hackathon-Antler.git /tmp/parent-antler
cd /tmp/parent-antler && git fetch --depth 1 origin 6e661cf9f6ad6d2a0234254e49a24df6c74f90eb && git checkout 6e661cf9f6ad6d2a0234254e49a24df6c74f90eb -- src/lib/research/skills
echo "skill dirs: $(ls src/lib/research/skills | wc -l)"
```
Expected: `skill dirs: 26`. (If the partial-checkout flags fail in this git version, fall back to a full `git clone` then `git checkout <SHA>`.)

- [ ] **Step 2: Copy into the package**

```bash
mkdir -p /Users/mac/Documents/permitos/research_agentic/research_agentic/skills
cp -R /tmp/parent-antler/src/lib/research/skills/. /Users/mac/Documents/permitos/research_agentic/research_agentic/skills/
echo "copied skill dirs: $(ls /Users/mac/Documents/permitos/research_agentic/research_agentic/skills | wc -l)"
echo "each has SKILL.md: $(for d in /Users/mac/Documents/permitos/research_agentic/research_agentic/skills/*/; do test -f "$d/SKILL.md" && echo ok; done | wc -l)"
```
Expected: `copied skill dirs: 26` and `each has SKILL.md: 26`. The 26 ids must match the spec/reference list (`ca-ab2588-hot-spots` … `vcapcd-rule-74-graphic-arts`).

- [ ] **Step 3: Ensure the package wheel ships the skills.** In `pyproject.toml`, hatchling already includes the `research_agentic` package dir; confirm non-`.py` files are included by adding (if not present):

```toml
[tool.hatch.build.targets.wheel.force-include]
"research_agentic/skills" = "research_agentic/skills"
```

- [ ] **Step 4: Commit** (data, no test of its own — exercised by T12)

```bash
git add research_agentic/research_agentic/skills research_agentic/pyproject.toml
git commit -m "feat(agentic): port 26-program SKILL.md + program.json law-code library"
```

---

## Task 12: `sandbox_tools/skills.py` — `read_skill`

**Files:**
- Create: `research_agentic/research_agentic/sandbox_tools/skills.py`
- Test: `research_agentic/tests/test_skills.py`

> Greenfield Phase 1: `read_skill(skill_id)` reads the bundled `research_agentic/skills/<id>/SKILL.md`, guarded against path traversal. The parent's hypothesis-fallback (`skill_for_hypothesis`) needs the registry and is deferred to Phase 3.

- [ ] **Step 1: Write the failing test** `tests/test_skills.py`

```python
from research_agentic.sandbox_tools.skills import read_skill


def test_read_existing_skill():
    out = read_skill("vcapcd-rule-23-exemption")
    assert out["ok"] is True
    assert out["skill_id"] == "vcapcd-rule-23-exemption"
    assert len(out["content"]) > 0


def test_missing_skill_returns_error():
    out = read_skill("no-such-skill")
    assert out["ok"] is False and out["error"]["code"] == "skill_not_found"


def test_empty_skill_id():
    out = read_skill("")
    assert out["ok"] is False and out["error"]["code"] == "skill_not_found"


def test_traversal_blocked():
    out = read_skill("../../../etc/passwd")
    assert out["ok"] is False and out["error"]["code"] in {"skill_not_found", "invalid_skill_id"}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd research_agentic && python -m pytest tests/test_skills.py -q`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write `sandbox_tools/skills.py`**

```python
"""read_skill — load a bundled law-code skill for orientation (NEVER citable evidence).

Adapted from the parent repo's agents._read_law_skill. Reads research_agentic/skills/<id>/
SKILL.md. The skill_id is validated to a single path segment (no traversal). The
hypothesis-fallback (skill_for_hypothesis) is added in Phase 3 with the ported registry.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from research_agentic.policy import _error, _success

_SKILLS_ROOT = Path(__file__).resolve().parents[1] / "skills"


def read_skill(skill_id: str = "") -> dict[str, Any]:
    sid = (skill_id or "").strip()
    # A skill id is a single folder name — reject anything with path separators / traversal.
    if not sid or "/" in sid or "\\" in sid or sid in {".", ".."} or ".." in Path(sid).parts:
        return _error("error", "skill_not_found", f"No law-code skill found for {skill_id!r}.", skill_id=skill_id)
    path = _SKILLS_ROOT / sid / "SKILL.md"
    if not path.exists() or not path.is_file():
        return _error("error", "skill_not_found", f"No law-code skill found for {skill_id!r}.", skill_id=skill_id)
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as exc:
        return _error("error", "skill_read_failed", str(exc), skill_id=skill_id)
    return _success("read", skill_id=sid, content=content)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd research_agentic && python -m pytest tests/test_skills.py -q`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add research_agentic/research_agentic/sandbox_tools/skills.py research_agentic/tests/test_skills.py
git commit -m "feat(agentic): read_skill (bundled law-code orientation)"
```

---

## Task 13: `sandbox_runtime.py` — the in-sandbox CLI dispatcher

**Files:**
- Create: `research_agentic/research_agentic/sandbox_runtime.py`
- Test: `research_agentic/tests/test_sandbox_runtime.py`

> This module runs *inside* the modal.Sandbox: `python -m research_agentic.sandbox_runtime <tool> <json-args>`. It builds a `SandboxPolicy` from env, routes the tool name + JSON args to the body, and prints one JSON line. Unknown tools / bad JSON / body exceptions become structured `{"ok": false}` JSON — it never raises across the boundary (the host detects a true crash via the process exit code). The pure `dispatch()` function is unit-tested directly.

- [ ] **Step 1: Write the failing test** `tests/test_sandbox_runtime.py`

```python
from pathlib import Path

from research_agentic.policy import SandboxPolicy
from research_agentic.sandbox_runtime import dispatch


def _policy(tmp_path: Path) -> SandboxPolicy:
    return SandboxPolicy(run_id="run-1", artifact_root=tmp_path)


def test_dispatch_compute(tmp_path):
    out = dispatch("compute_voc_threshold",
                   {"voc_content": 6.8, "voc_content_unit": "lb/gal", "mass_limit_lb": 200.0},
                   _policy(tmp_path))
    assert out["ok"] is True and out["usage_limit"]["gal"] == 29.41


def test_dispatch_unknown_tool(tmp_path):
    out = dispatch("nope", {}, _policy(tmp_path))
    assert out["ok"] is False and out["error"]["code"] == "unknown_tool"


def test_dispatch_read_skill(tmp_path):
    out = dispatch("read_skill", {"skill_id": "vcapcd-rule-23-exemption"}, _policy(tmp_path))
    assert out["ok"] is True


def test_dispatch_write_then_read_artifact(tmp_path):
    pol = _policy(tmp_path)
    w = dispatch("write_artifact", {"relative_path": "n.txt", "contents": "hi"}, pol)
    assert w["ok"] is True
    r = dispatch("read_spreadsheet", {"path": "n.txt"}, pol)  # wrong type -> structured error, no raise
    assert r["ok"] is False


def test_dispatch_catches_body_exception(tmp_path, monkeypatch):
    import research_agentic.sandbox_runtime as rt
    def boom(policy, **kw):
        raise RuntimeError("kaboom")
    monkeypatch.setitem(rt._TOOLS, "web_fetch", lambda policy, args: boom(policy))
    out = dispatch("web_fetch", {"url": "https://x.gov"}, _policy(tmp_path))
    assert out["ok"] is False and out["error"]["code"] == "tool_call_failed"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd research_agentic && python -m pytest tests/test_sandbox_runtime.py -q`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write `sandbox_runtime.py`** (the dispatch table maps each tool name to a closure that adapts JSON args → the body call, mirroring the parent's `_sandbox_function_map`)

```python
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd research_agentic && python -m pytest tests/test_sandbox_runtime.py -q`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add research_agentic/research_agentic/sandbox_runtime.py research_agentic/tests/test_sandbox_runtime.py
git commit -m "feat(agentic): in-sandbox tool dispatcher (sandbox_runtime)"
```

---

## Task 14: `sandbox.py` — the sandbox image builder

**Files:**
- Create: `research_agentic/research_agentic/sandbox.py` (first slice; T15 appends)
- Test: `research_agentic/tests/test_sandbox_session.py` (image-structure assertion only here; session tests in T15)

> Phase 1 image deliberately OMITS playwright+chromium (heavy; Phase 2 adds it). The image installs the doc/web deps + the `research_agentic` package so `python -m research_agentic.sandbox_runtime` resolves in-sandbox.

- [ ] **Step 1: Write the failing test** `tests/test_sandbox_session.py` (image slice)

```python
def test_build_sandbox_image_returns_image():
    import modal

    from research_agentic.sandbox import build_sandbox_image

    image = build_sandbox_image()
    assert isinstance(image, modal.Image)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd research_agentic && python -m pytest tests/test_sandbox_session.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'research_agentic.sandbox'` (or `modal` if not installed in the env; see note below).

> **Env note:** these tests import `modal`. If the dev env lacks it, install host deps first: `cd research_agentic && pip install -e . -e ../research_core` is NOT needed for modal; just `pip install 'modal>=1.4' 'nvidia-nat[langchain]>=1.5' httpx pytest`. Building a `modal.Image` object does NOT require Modal auth or network (it is a lazy spec); only T17 (live smoke) needs `modal token`.

- [ ] **Step 3: Write the image-builder slice of `sandbox.py`**

```python
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd research_agentic && python -m pytest tests/test_sandbox_session.py::test_build_sandbox_image_returns_image -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add research_agentic/research_agentic/sandbox.py research_agentic/tests/test_sandbox_session.py
git commit -m "feat(agentic): sandbox image builder (Phase 1 deps)"
```

---

## Task 15: `sandbox.py` — `SandboxSession` + `run_tool` + contextvar

**Files:**
- Modify: `research_agentic/research_agentic/sandbox.py` (append)
- Modify: `research_agentic/tests/test_sandbox_session.py` (append session tests with a fake sandbox)

> `run_tool` is the fail-loud operational boundary: a non-zero exit code or unparseable stdout from the in-sandbox dispatcher raises `SandboxOperationalError` (→ the spec's "operational failure → error code"). A *tool-level* problem instead comes back as a structured `{"ok": false}` JSON, which `run_tool` returns as-is. Tests inject a **fake sandbox** — no Modal needed.

- [ ] **Step 1: Append the failing tests** to `tests/test_sandbox_session.py`

```python
import json

import pytest

from research_agentic.sandbox import (
    SandboxOperationalError,
    current_sandbox_session,
    run_tool,
    use_sandbox_session,
)


class _FakeProc:
    def __init__(self, out="", err="", code=0):
        self._out, self._err, self._code = out, err, code

    class _Stream:
        def __init__(self, s):
            self._s = s

        def read(self):
            return self._s

    @property
    def stdout(self):
        return self._Stream(self._out)

    @property
    def stderr(self):
        return self._Stream(self._err)

    def wait(self):
        return self._code


class _FakeSandbox:
    def __init__(self, proc):
        self._proc = proc
        self.terminated = False

    def exec(self, *args, **kwargs):
        self.last_args = args
        return self._proc

    def terminate(self):
        self.terminated = True


class _FakeSession:
    def __init__(self, proc):
        self.sandbox = _FakeSandbox(proc)
        self.run_id = "run-1"


def test_run_tool_parses_ok_json():
    sess = _FakeSession(_FakeProc(out=json.dumps({"ok": True, "status": "fetched", "text": "hi"})))
    out = run_tool(sess, "web_fetch", {"url": "https://x.gov"})
    assert out["ok"] is True and out["text"] == "hi"
    # The dispatcher was invoked as a module with tool + json args.
    assert sess.sandbox.last_args[:3] == ("python", "-m", "research_agentic.sandbox_runtime")
    assert sess.sandbox.last_args[3] == "web_fetch"
    assert json.loads(sess.sandbox.last_args[4]) == {"url": "https://x.gov"}


def test_run_tool_returns_structured_tool_error():
    sess = _FakeSession(_FakeProc(out=json.dumps({"ok": False, "status": "blocked", "error": {"code": "host_not_fetchable", "message": "no"}})))
    out = run_tool(sess, "web_fetch", {"url": "http://127.0.0.1"})
    assert out["ok"] is False and out["error"]["code"] == "host_not_fetchable"


def test_run_tool_nonzero_exit_raises():
    sess = _FakeSession(_FakeProc(out="", err="Traceback...", code=1))
    with pytest.raises(SandboxOperationalError):
        run_tool(sess, "web_fetch", {"url": "https://x.gov"})


def test_run_tool_unparseable_stdout_raises():
    sess = _FakeSession(_FakeProc(out="not json at all", code=0))
    with pytest.raises(SandboxOperationalError):
        run_tool(sess, "web_fetch", {"url": "https://x.gov"})


def test_contextvar_set_and_get():
    sess = _FakeSession(_FakeProc(out="{}"))
    assert current_sandbox_session() is None
    with use_sandbox_session(sess):
        assert current_sandbox_session() is sess
    assert current_sandbox_session() is None
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd research_agentic && python -m pytest tests/test_sandbox_session.py -q`
Expected: FAIL — `ImportError: cannot import name 'run_tool'`.

- [ ] **Step 3: Append to `sandbox.py`**

```python
# ----- session + run_tool + contextvar (append to sandbox.py) -----

import contextlib
import contextvars
import json as _json
from typing import Any, Iterator, Optional


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
            env={"RUN_ID": run_id, "ARTIFACT_ROOT": "/workspace"},
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd research_agentic && python -m pytest tests/test_sandbox_session.py -q`
Expected: PASS (6 passed total in the file).

- [ ] **Step 5: Commit**

```bash
git add research_agentic/research_agentic/sandbox.py research_agentic/tests/test_sandbox_session.py
git commit -m "feat(agentic): SandboxSession + fail-loud run_tool + session contextvar"
```

---

## Task 16: `functions/researcher_tools.py` — AIQ wrappers + register

**Files:**
- Create: `research_agentic/research_agentic/functions/__init__.py` (empty)
- Create: `research_agentic/research_agentic/functions/researcher_tools.py`
- Modify: `research_agentic/research_agentic/register.py` (enable the import)
- Test: `research_agentic/tests/test_functions.py`

> Each AIQ tool is a thin host-side wrapper: it resolves the current researcher's `SandboxSession` (contextvar) and calls `run_tool`. With no session set it returns a structured `sandbox_required` error (so a misconfigured call fails soft at the tool layer, while a true sandbox crash still fails loud via `run_tool`). Registration makes `nat` discover the 10 tools; Phase 2's researcher agent consumes them.

- [ ] **Step 1: Write the failing test** `tests/test_functions.py`

```python
import json

import pytest

from research_agentic.functions import researcher_tools as rt
from research_agentic.sandbox import use_sandbox_session


class _FakeSession:
    def __init__(self):
        self.calls = []
        self.run_id = "run-1"

    # run_tool is monkeypatched, so the sandbox attribute is unused here.


def test_tool_without_session_returns_structured_error():
    out = json.loads(rt._web_fetch_impl("https://x.gov"))
    assert out["ok"] is False and out["error"]["code"] == "sandbox_required"


def test_tool_with_session_routes_to_run_tool(monkeypatch):
    captured = {}

    def fake_run_tool(session, tool, args):
        captured["tool"] = tool
        captured["args"] = args
        return {"ok": True, "status": "fetched", "text": "hi"}

    monkeypatch.setattr(rt, "run_tool", fake_run_tool)
    with use_sandbox_session(_FakeSession()):
        out = json.loads(rt._web_fetch_impl("https://www.aqmd.gov/x"))
    assert out["ok"] is True
    assert captured["tool"] == "web_fetch"
    assert captured["args"] == {"url": "https://www.aqmd.gov/x"}


def test_all_ten_tools_registered():
    # register.py import must succeed and define 10 builders.
    import research_agentic.register  # noqa: F401
    assert len(rt.TOOL_NAMES) == 10
    assert set(rt.TOOL_NAMES) == {
        "read_skill", "web_search", "web_fetch", "browser_use", "read_pdf",
        "read_docx", "read_spreadsheet", "compute_voc_threshold", "write_artifact", "submit_finding",
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd research_agentic && python -m pytest tests/test_functions.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'research_agentic.functions'` (needs `nvidia-nat` installed; if absent, `pip install 'nvidia-nat[langchain]>=1.5'`).

- [ ] **Step 3: Write `functions/__init__.py`** (empty) and **`functions/researcher_tools.py`**

```python
"""AIQ function wrappers for the sandboxed researcher tools (host-side, thin).

Each wrapper resolves the current researcher's SandboxSession (a contextvar set by the
researcher agent in Phase 2; set by tests/smoke in Phase 1) and runs the tool INSIDE that
sandbox via run_tool. With no active session the wrapper returns a structured
'sandbox_required' error. A genuine sandbox crash propagates from run_tool (fail-loud).
Registering these makes nat discover the 10-tool suite; no agent calls them until Phase 2.
"""

from __future__ import annotations

import json
from typing import Any

from nat.builder.builder import Builder
from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig

from research_agentic.sandbox import current_sandbox_session, run_tool

TOOL_NAMES = (
    "read_skill",
    "web_search",
    "web_fetch",
    "browser_use",
    "read_pdf",
    "read_docx",
    "read_spreadsheet",
    "compute_voc_threshold",
    "write_artifact",
    "submit_finding",
)

_DESCRIPTIONS = {
    "read_skill": "Load a law-code skill for orientation on this hypothesis's thresholds/exemptions. Orientation only — NEVER citable evidence.",
    "web_search": "Search the open web for official primary sources (returns title/url/authority_rank).",
    "web_fetch": "Fetch a public URL inside the sandbox; extracts PDF/HTML text, follows redirects under the SSRF guard.",
    "browser_use": "Open a public page in a guarded headless browser (runs JS / clears bot challenges).",
    "read_pdf": "Read a PDF from the run workspace.",
    "read_docx": "Read a DOCX from the run workspace.",
    "read_spreadsheet": "Read a CSV/XLSX from the run workspace.",
    "compute_voc_threshold": "Compute VOC/ROC thresholds: mass limit (lb/period) <-> usage limit (gal) or emissions.",
    "write_artifact": "Write an artifact into the run workspace.",
    "submit_finding": "Submit the final sourced finding. Terminal.",
}


def _no_session() -> str:
    return json.dumps({
        "ok": False, "status": "blocked",
        "error": {"code": "sandbox_required", "message": "No active sandbox session for this researcher."},
    })


def _call(tool: str, args: dict[str, Any]) -> str:
    session = current_sandbox_session()
    if session is None:
        return _no_session()
    return json.dumps(run_tool(session, tool, args))


# --- per-tool impls (typed signatures so nat/LangChain builds a proper tool schema) ---

def _read_skill_impl(skill_id: str = "") -> str:
    return _call("read_skill", {"skill_id": skill_id})


def _web_search_impl(query: str, limit: int = 5) -> str:
    return _call("web_search", {"query": query, "limit": limit})


def _web_fetch_impl(url: str) -> str:
    return _call("web_fetch", {"url": url})


def _browser_use_impl(url: str, wait_until: str = "domcontentloaded") -> str:
    return _call("browser_use", {"url": url, "wait_until": wait_until})


def _read_pdf_impl(path: str) -> str:
    return _call("read_pdf", {"path": path})


def _read_docx_impl(path: str) -> str:
    return _call("read_docx", {"path": path})


def _read_spreadsheet_impl(path: str) -> str:
    return _call("read_spreadsheet", {"path": path})


def _compute_voc_threshold_impl(
    voc_content: float,
    voc_content_unit: str = "weight_percent",
    density: float | None = None,
    density_unit: str = "lb/gal",
    mass_limit_lb: float | None = None,
    usage: float | None = None,
    usage_unit: str = "gal",
    control_efficiency: float = 0.0,
) -> str:
    return _call("compute_voc_threshold", {
        "voc_content": voc_content, "voc_content_unit": voc_content_unit,
        "density": density, "density_unit": density_unit, "mass_limit_lb": mass_limit_lb,
        "usage": usage, "usage_unit": usage_unit, "control_efficiency": control_efficiency,
    })


def _write_artifact_impl(relative_path: str, contents: str) -> str:
    return _call("write_artifact", {"relative_path": relative_path, "contents": contents})


def _submit_finding_impl(
    title: str, summary: str, sources: list[str], confidence: float, metadata_json: str | None = None,
) -> str:
    metadata: dict[str, Any] | None = None
    if metadata_json:
        try:
            parsed = json.loads(metadata_json)
            metadata = parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return json.dumps({"ok": False, "status": "error",
                               "error": {"code": "invalid_metadata_json", "message": "metadata_json must be valid JSON object."}})
    return _call("submit_finding", {
        "title": title, "summary": summary, "sources": sources, "confidence": confidence, "metadata": metadata,
    })


_IMPLS = {
    "read_skill": _read_skill_impl,
    "web_search": _web_search_impl,
    "web_fetch": _web_fetch_impl,
    "browser_use": _browser_use_impl,
    "read_pdf": _read_pdf_impl,
    "read_docx": _read_docx_impl,
    "read_spreadsheet": _read_spreadsheet_impl,
    "compute_voc_threshold": _compute_voc_threshold_impl,
    "write_artifact": _write_artifact_impl,
    "submit_finding": _submit_finding_impl,
}


# --- AIQ registration: one config + builder per tool ---

class ReadSkillConfig(FunctionBaseConfig, name="read_skill"):
    pass


class WebSearchConfig(FunctionBaseConfig, name="web_search"):
    pass


class WebFetchConfig(FunctionBaseConfig, name="web_fetch"):
    pass


class BrowserUseConfig(FunctionBaseConfig, name="browser_use"):
    pass


class ReadPdfConfig(FunctionBaseConfig, name="read_pdf"):
    pass


class ReadDocxConfig(FunctionBaseConfig, name="read_docx"):
    pass


class ReadSpreadsheetConfig(FunctionBaseConfig, name="read_spreadsheet"):
    pass


class ComputeVocThresholdConfig(FunctionBaseConfig, name="compute_voc_threshold"):
    pass


class WriteArtifactConfig(FunctionBaseConfig, name="write_artifact"):
    pass


class SubmitFindingConfig(FunctionBaseConfig, name="submit_finding"):
    pass


def _yield(name: str):
    return FunctionInfo.from_fn(_IMPLS[name], description=_DESCRIPTIONS[name])


@register_function(config_type=ReadSkillConfig)
async def read_skill(config: ReadSkillConfig, builder: Builder):
    yield _yield("read_skill")


@register_function(config_type=WebSearchConfig)
async def web_search(config: WebSearchConfig, builder: Builder):
    yield _yield("web_search")


@register_function(config_type=WebFetchConfig)
async def web_fetch(config: WebFetchConfig, builder: Builder):
    yield _yield("web_fetch")


@register_function(config_type=BrowserUseConfig)
async def browser_use(config: BrowserUseConfig, builder: Builder):
    yield _yield("browser_use")


@register_function(config_type=ReadPdfConfig)
async def read_pdf(config: ReadPdfConfig, builder: Builder):
    yield _yield("read_pdf")


@register_function(config_type=ReadDocxConfig)
async def read_docx(config: ReadDocxConfig, builder: Builder):
    yield _yield("read_docx")


@register_function(config_type=ReadSpreadsheetConfig)
async def read_spreadsheet(config: ReadSpreadsheetConfig, builder: Builder):
    yield _yield("read_spreadsheet")


@register_function(config_type=ComputeVocThresholdConfig)
async def compute_voc_threshold(config: ComputeVocThresholdConfig, builder: Builder):
    yield _yield("compute_voc_threshold")


@register_function(config_type=WriteArtifactConfig)
async def write_artifact(config: WriteArtifactConfig, builder: Builder):
    yield _yield("write_artifact")


@register_function(config_type=SubmitFindingConfig)
async def submit_finding(config: SubmitFindingConfig, builder: Builder):
    yield _yield("submit_finding")
```

- [ ] **Step 4: Enable the import in `register.py`** (replace the commented line)

```python
from research_agentic.functions import researcher_tools  # noqa: F401
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd research_agentic && python -m pytest tests/test_functions.py -q`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add research_agentic/research_agentic/functions research_agentic/research_agentic/register.py research_agentic/tests/test_functions.py
git commit -m "feat(agentic): register 10 sandboxed researcher tools as AIQ functions"
```

---

## Task 17: Live smoke — one tool in a real `modal.Sandbox`

**Files:**
- Create: `research_agentic/research_agentic/scripts/smoke_web_fetch.py`

> This is the Phase 1 acceptance gate. It provisions a REAL `modal.Sandbox` and runs `web_fetch` against a real SCAQMD rule PDF (httpx + PyMuPDF path; no browser needed). Requires Modal auth (`modal token new` / `modal setup`). Not a pytest (needs Modal + network).

- [ ] **Step 1: Write `scripts/smoke_web_fetch.py`**

```python
"""Live Phase 1 smoke: run web_fetch inside a real modal.Sandbox.

Usage (from research_agentic/, with Modal auth configured):
    python research_agentic/scripts/smoke_web_fetch.py

Asserts: a real sandbox provisions, web_fetch pulls + PDF-extracts a real SCAQMD rule, the
text contains rule language, and the source is authority rank 1. Prints PASS/FAIL.
"""

from __future__ import annotations

import sys

from research_agentic.policy import source_authority_rank
from research_agentic.sandbox import SandboxSession, run_tool

RULE_PDF = "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf"


def main() -> int:
    assert source_authority_rank(RULE_PDF) == 1, "expected aqmd.gov to be authority rank 1"
    with SandboxSession(run_id="smoke-phase1", timeout_seconds=300) as session:
        result = run_tool(session, "web_fetch", {"url": RULE_PDF})
    ok = bool(result.get("ok"))
    text = result.get("text", "") or ""
    extracted = result.get("extracted_format")
    print(f"ok={ok} extracted_format={extracted!r} text_len={len(text)} status={result.get('status_code')}")
    print("text head:", text[:240].replace("\n", " "))
    passed = ok and extracted == "pdf" and len(text) > 500 and ("Permit" in text or "Rule 201" in text or "201" in text)
    print("SMOKE:", "PASS" if passed else "FAIL")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run the live smoke**

Run: `cd research_agentic && python research_agentic/scripts/smoke_web_fetch.py`
Expected: `ok=True extracted_format='pdf' text_len=<large> ...` then `SMOKE: PASS`.
Troubleshooting: if `SandboxOperationalError` mentions `ModuleNotFoundError: research_agentic`, the image's `add_local_dir`/`pip install -e` path is wrong — verify `_REPO_ROOT` resolves to the repo root and the package dir copied in. If the result is `dependency_missing pymupdf`, add `pymupdf` to `_SANDBOX_PIP` (it should already be there). If Modal auth fails, run `modal setup` first.

- [ ] **Step 3: Commit**

```bash
git add research_agentic/research_agentic/scripts/smoke_web_fetch.py
git commit -m "feat(agentic): live web_fetch-in-sandbox smoke (Phase 1 gate)"
```

---

## Task 18: Phase 1 gate — full suite green + lint + README + final review

**Files:**
- Modify: `research_agentic/README.md`

- [ ] **Step 1: Run the full offline unit suite**

Run: `cd research_agentic && python -m pytest -q`
Expected: ALL pass (≈ 40+ tests across 13 files), zero network, zero Modal calls.

- [ ] **Step 2: Lint**

Run: `cd research_agentic && ruff check research_agentic/`
Expected: clean (fix any line-length/import issues; do not change behavior).

- [ ] **Step 3: Expand `README.md`** to document: package purpose; that Phase 1 ships sandbox provisioning + the 10-tool suite executed in-sandbox; the architecture (host wrapper → `run_tool` → in-sandbox `sandbox_runtime` dispatcher → tool body); how to run unit tests (`python -m pytest -q`) and the live smoke (`python research_agentic/scripts/smoke_web_fetch.py`, needs Modal auth); and the in-sandbox vs host dependency split. Point to the spec + the parent-extraction reference.

- [ ] **Step 4: Final self-review against the spec.** Confirm: (a) every tool from `RESEARCHER_TOOL_NAMES` is ported + registered (10); (b) the SSRF guard + authority tiering + output cap are mechanical + tested; (c) `run_tool` is fail-loud on operational failure but returns structured tool errors; (d) no agents were built (Phase 2); (e) no `research_core`/`research_aiq` import (greenfield). Note any deferrals explicitly in the README "Phase 2+" section (playwright in the image; read_skill hypothesis fallback; artifact collection; per-subagent secrets wiring).

- [ ] **Step 5: Commit**

```bash
git add research_agentic/README.md
git commit -m "docs(agentic): Phase 1 README + gate (sandbox + tools foundation complete)"
```

---

## Self-Review (plan author)

**Spec coverage:**
- "modal.Sandbox provisioning" → T14 (image) + T15 (SandboxSession). ✔
- "safety policy (egress guards, authority-tier classifier, injection quarantine)" → T2–T5 (`host_fetchable` SSRF, `source_authority_rank` tiering, `_cap_text`); **injection quarantine** is handled structurally (fetched content is returned as DATA in a result dict, never executed; the sandbox is the containment boundary) — there is no "interpret as instructions" path in Phase 1 since there is no agent. The explicit injection-quarantine *test* belongs in Phase 3 (senior verifier / agent context), noted in the spec's testing section. Flagged, not silently dropped.
- "port the tool suite as in-sandbox AIQ functions" → T6–T13 (bodies) + T16 (AIQ wrappers). All 10 of `RESEARCHER_TOOL_NAMES`. ✔
- "unit tests" → every body/policy task is TDD; T18 runs the full suite. ✔
- "single-tool-in-sandbox live smoke" → T17. ✔
- "No agents yet" → confirmed; researcher/orchestrator/verifier are Phases 2–3. ✔
- Error model ("operational failure → error code; sandbox death → restart then error code") → `SandboxOperationalError` from `run_tool` (T15) is the operational-failure path; restart-in-fresh-sandbox is the orchestrator's job (Phase 3) using this signal. Tool-level rejections stay structured. ✔
- "Open to find / tiered authority to cite" → `host_fetchable` (open egress) + `source_authority_rank` (tiers), tested in T4. ✔
- Greenfield (no research_core/research_aiq reuse) → `authority_hosts.py` replaces the registry dep; skills ported (T11). ✔

**Placeholder scan:** none — every code/test step has complete code; the only deferrals (playwright image, read_skill fallback, artifact collection, injection-quarantine test) are explicitly labeled Phase 2/3.

**Type consistency:** `SandboxPolicy`, `_error`/`_success`/`_invalid_argument`/`_exception_error`, `_resolve_workspace_path`, `host_fetchable`/`host_allowed`/`source_authority_rank`, `_cap_text`, `run_tool`/`SandboxSession`/`SandboxOperationalError`/`current_sandbox_session`/`use_sandbox_session`, `dispatch`/`_TOOLS`/`policy_from_env`, `TOOL_NAMES`/`_IMPLS` — names are identical across the tasks that define and consume them. The dispatcher's `_TOOLS` (10 keys) matches `functions.TOOL_NAMES` (10) matches the parent's `RESEARCHER_TOOL_NAMES` (10).

**Decomposition:** policy/authority split cleanly; tool bodies one-file-per-concern; host vs in-sandbox boundary explicit; cycles broken by lazy imports. Each task is independently testable and committed.

---

## Execution Handoff

Two options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks.
2. **Inline Execution** — batch execution with checkpoints.

The user has standing instruction "subagent driven development" for sub-project E → proceed with option 1 after approval.
