# research_agentic

AIQ-native open-discovery EHS research core (sub-project E).

**Phase 1** (this package) ships the sandbox provisioning layer and the full 10-tool
open-discovery suite, each tool executed inside a `modal.Sandbox` container and
registered as an AIQ function. Phases 2–4 add the researcher agent, orchestration +
senior verifier + safety stack, and eval + endpoint cutover.

**Spec:** `docs/superpowers/specs/2026-06-03-aiq-open-discovery-researcher-design.md`
**Parent-extraction reference:** `docs/superpowers/references/2026-06-03-parent-research-core-extraction.md`

---

## Purpose

Replace the closed, registry-bounded, pointer-gated research pipeline with an
open-discovery agentic consultant. Researchers browse/search the open web for primary
EHS authority sources (no curated pointer gate); a senior verifier enforces mechanical
citation-integrity and authority-tier floors. The entire stack — tools, sandbox, agents,
safety policy — is owned by AIQ (`nvidia-nat`) so `nat eval` + the C-phase profiler/
scorecard run over the open-discovery flow.

---

## Phase 1 scope

Phase 1 delivers exactly two things:

1. **`modal.Sandbox` provisioning layer** (`research_agentic/sandbox.py`): image builder
   with the in-sandbox deps, `SandboxSession` context manager, `run_tool()`, a contextvar
   for the active session, and `SandboxOperationalError` for fail-loud operational failure.

2. **10-tool open-discovery suite** — all 10 tools ported from the parent repo
   (`docs/superpowers/references/…`), executed *inside* the sandbox via a CLI dispatcher,
   and registered as AIQ `@register_function` wrappers on the host:

   | Tool | File |
   |---|---|
   | `read_skill` | `sandbox_tools/skills.py` |
   | `web_search` | `sandbox_tools/web.py` |
   | `web_fetch` | `sandbox_tools/web.py` |
   | `browser_use` | `sandbox_tools/browser.py` |
   | `read_pdf` | `sandbox_tools/documents.py` |
   | `read_docx` | `sandbox_tools/documents.py` |
   | `read_spreadsheet` | `sandbox_tools/documents.py` |
   | `compute_voc_threshold` | `sandbox_tools/compute.py` |
   | `write_artifact` | `sandbox_tools/artifacts.py` |
   | `submit_finding` | `sandbox_tools/artifacts.py` |

---

## Architecture

```
Host (nvidia-nat AIQ worker)
  │
  │  @register_function wrapper (functions/researcher_tools.py)
  │    resolves current_sandbox_session() [contextvar]
  │    calls run_tool(session, tool_name, args)
  │
  ▼
research_agentic/sandbox.py :: run_tool()
  │  execs inside the modal.Sandbox:
  │    python -m research_agentic.sandbox_runtime <tool_name> <json_args>
  │
  ▼
research_agentic/sandbox_runtime.py (runs INSIDE the container)
  │  builds SandboxPolicy from environment
  │  dispatches to the matching tool body (_TOOLS dict, 10 entries)
  │  prints JSON result to stdout
  │
  ▼
research_agentic/sandbox_tools/<file>.py :: tool body
  │  all path ops guarded via _resolve_workspace_path (no traversal / no escape)
  │  network egress guarded via host_fetchable (SSRF block)
  │  output capped via _cap_text (default 16 000 chars)
  │  returns structured {"ok": true/false, ...} dict
  │
  ▼ (back to host via stdout JSON)
run_tool() returns the dict to the AIQ wrapper
  Operational failure (non-zero exit, empty/unparseable output) → SandboxOperationalError (fail-loud)
  Tool-level rejection → {"ok": false, "error": {...}} (structured, not an exception)
```

---

## Safety policy

Three mechanical, unit-tested guarantees (no agent judgment required):

- **SSRF guard** (`host_fetchable` in `policy.py`): blocks loopback, private/link-local
  IPs, cloud-metadata addresses, and non-HTTP(S) schemes from inside the sandbox.
- **Authority tiering** (`source_authority_rank`): rank 1 = curated EHS authorities + CA
  air districts; rank 2 = other `.gov`/`.mil`; rank 3 = public. Verified via suffix match,
  not substring (spoof-proof).
- **Output cap** (`_cap_text`): truncates over-long tool output with a visible marker so
  the agent knows to fetch a more specific section. Default 16 000 chars; override via
  `RESEARCH_CORE_MAX_TOOL_CHARS` (floor: 1 000).

Path guards (`_resolve_workspace_path`) prevent directory traversal and escape from the
per-run workspace (`artifact_root/<run_id>/`).

---

## Dependency split

| Location | Packages |
|---|---|
| **Host** (installed in venv, used in unit tests) | `nvidia-nat[langchain]>=1.5`, `modal>=1.4`, `httpx` |
| **Sandbox image only** (added by `build_sandbox_image()`; import-guarded in tool bodies; NOT on host) | `pymupdf` (fitz), `beautifulsoup4`, `python-docx`, `openpyxl`, `openai` |
| **Deferred to Phase 2** | `playwright` + chromium (browser_use live path) |

Tool bodies that need sandbox-only deps guard their imports and return a structured
`{"ok": false, "error": {"code": "dependency_missing"}}` result when the dep is absent
(so unit tests stay fully offline with no network or Modal).

---

## Running the tests

### Offline unit suite (no Modal, no network — 88 tests)

```bash
cd research_agentic
.venv/bin/python -m pytest -q
```

All 88 tests run offline. Modal and network calls are monkeypatched; heavy sandbox deps
(`fitz`, `docx`, `openpyxl`) are covered via the `dependency_missing` branch.

### Live smoke (requires Modal auth)

```bash
# Ensure Modal is authenticated first:
modal token new   # or: modal setup

cd research_agentic
.venv/bin/python research_agentic/scripts/smoke_web_fetch.py
```

The smoke provisions a real `modal.Sandbox`, runs `web_fetch` against a live SCAQMD Rule
201 PDF (`aqmd.gov`), PDF-extracts the text with PyMuPDF, and asserts the source is
authority rank 1. Expected output: `SMOKE: PASS`.

---

## Phase 2+ (deferred)

The following items are explicitly deferred to later phases and are NOT in Phase 1:

- **Playwright + chromium in the sandbox image** — `browser_use`'s live path requires
  Playwright; the image slot and the tool body are in place, but the live path is a Phase
  2 item (the `browser_use` unit test covers the offline/not-installed branch).
- **`read_skill` hypothesis-fallback** — the skill reader currently loads a skill by exact
  `skill_id`; the "pick the best skill for this hypothesis" fallback logic depends on the
  skill registry, which is a Phase 2/3 concern.
- **Artifact collection from the sandbox** — per-run findings + source snapshots written to
  `artifact_root` are collected to a Modal volume and Supabase in Phase 3's `store.py`.
- **Per-subagent secrets wiring** — API keys (search, OpenAI) are injected into the sandbox
  image via Modal secrets; the wiring is done in Phase 2 when the researcher agent is
  assembled.
- **Injection-quarantine test** — fetched content is structurally quarantined (returned as
  DATA in a result dict, never executed); the explicit adversarial test (a page crafted to
  escape the sandbox) belongs in Phase 3 alongside the senior verifier and agent context.

**Researcher agent, orchestration agent, senior verifier, grounding floor (L2), recall
checklist (L3), output assembly, Modal endpoint, and `nat eval` scorecard** are all
Phases 2–4.
