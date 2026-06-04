# research_agentic

AIQ-native open-discovery EHS research core (sub-project E).

**Phase 1** ships the sandbox provisioning layer and the full 10-tool open-discovery suite,
each tool executed inside a `modal.Sandbox` container and registered as an AIQ function.
**Phase 2** ships the researcher `tool_calling_agent`, its sandboxed discovery loop, source
capture (dispatcher trace + `collect_run`), and a live end-to-end smoke that proved the
researcher ground a real VCAPCD Rule 23 finding with primary sources.
Phases 3–4 add orchestration + senior verifier + safety stack, and eval + endpoint cutover.

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
| **Deferred to Phase 3** | `playwright` + chromium (browser_use live path) |

Tool bodies that need sandbox-only deps guard their imports and return a structured
`{"ok": false, "error": {"code": "dependency_missing"}}` result when the dep is absent
(so unit tests stay fully offline with no network or Modal).

---

## Running the tests

### Offline unit suite (no Modal, no network — 102 tests)

```bash
cd research_agentic
.venv/bin/python -m pytest -q
```

All 102 tests run offline. Modal and network calls are monkeypatched; heavy sandbox deps
(`fitz`, `docx`, `openpyxl`) are covered via the `dependency_missing` branch.

### Phase 1 live smoke — single tool in a real sandbox (requires Modal auth)

```bash
# Ensure Modal is authenticated first:
modal token new   # or: modal setup

cd research_agentic
.venv/bin/python research_agentic/scripts/smoke_web_fetch.py
```

The Phase 1 smoke provisions a real `modal.Sandbox`, runs `web_fetch` against a live SCAQMD
Rule 201 PDF (`aqmd.gov`), PDF-extracts the text with PyMuPDF, and asserts the source is
authority rank 1. Expected output: `SMOKE: PASS`.

### Phase 2 live smoke — one researcher end-to-end (requires Modal + OpenAI auth)

```bash
# Ensure Modal is authenticated and the OpenAI secret is provisioned:
# modal secret create permitpilot-openai OPENAI_API_KEY=<key>

cd research_agentic
.venv/bin/python -m research_agentic.scripts.smoke_researcher
```

The Phase 2 smoke provisions a real `modal.Sandbox`, runs the full researcher loop on a
real VCAPCD Rule 23 / graphic-arts hypothesis, and asserts the agent submitted a grounded
finding citing a primary source. Expected output: `SMOKE: PASS`.

Note: use the `-m` module form above; a direct `python research_agentic/scripts/smoke_researcher.py`
invocation requires `PYTHONPATH=$(pwd)` in this venv's editable-install layout.

---

## Phase 2 — researcher agent

Phase 2 delivers the open-discovery **researcher `tool_calling_agent`**: a single LLM-driven
agent running its discovery loop inside its own `modal.Sandbox`, capturing source provenance,
and terminating on `submit_finding`. One researcher, one sandbox, one grounded finding.

### Researcher workflow (`configs/researcher.yml`)

The researcher is a nat `tool_calling_agent` wired to all 10 Phase-1 tools:

```yaml
workflow:
  _type: tool_calling_agent
  llm_name: openai_llm        # gpt-5.5 via OPENAI_RESEARCHER_MODEL env var
  tool_names: [read_skill, web_search, web_fetch, browser_use, read_pdf, read_docx,
               read_spreadsheet, compute_voc_threshold, write_artifact, submit_finding]
  handle_tool_errors: false   # fail-loud — SandboxOperationalError surfaces, not swallowed
  return_direct: [submit_finding]   # submit_finding is terminal; ends the run immediately
  max_iterations: 16
```

The `handle_tool_errors: false` setting preserves the fail-loud discipline: a sandbox or
tool operational failure (`SandboxOperationalError`) surfaces as an exception, never as a
silent agent retry. `return_direct: [submit_finding]` ensures the agent exits immediately
after submitting its finding.

### Driver: `run_researcher(task)` and `drive(task)`

Two entry points in `researcher.py`:

- **`run_researcher(task: ResearcherTask) → ResearcherResult`** — synchronous entry point
  (for scripts and tests). Runs the async `drive` coroutine on a fresh event loop.
- **`drive(task) → ResearcherResult`** — async entry (the public coroutine Phase 3's
  concurrent orchestrator calls). Provisions the sandbox, binds it, runs the agent, collects, and
  tears down.

```python
from research_agentic.researcher import run_researcher
from research_agentic.task import ResearcherTask

result = run_researcher(ResearcherTask(
    run_id="my-run",
    hypothesis="Does this operation trigger VCAPCD Rule 23?",
    skill_id="vcapcd-rule-23-exemption",
    facts={"county": "Ventura"},
))
# result.findings, result.trace, result.artifacts
```

### Session threading (no process-global)

The sandbox session is bound via the `use_sandbox_session` **contextvar** in the same
coroutine that drives `runner.result`. This makes `current_sandbox_session()` visible
inside the tool nodes (langgraph copies the current context into each node) without a
process-global or lock. This is critical for Phase 3's concurrent orchestrator: each
researcher coroutine binds its own session contextvar independently.

```python
async def drive(task: ResearcherTask) -> ResearcherResult:
    session = _make_session(task.run_id)
    with session:                         # provisions the modal.Sandbox
        with use_sandbox_session(session):  # binds the contextvar
            agent_output = await _run_agent(task.to_input_message())
            arts = collect_run(session)   # collect before teardown
    return ResearcherResult(...)
```

### Source capture: dispatcher trace + `__collect__`

Every tool call dispatched by `sandbox_runtime.py` appends a compact provenance record to
`<workspace>/<run_id>/trace.jsonl` (tool name, ok/fail, url/final_url/status_code,
authority rank, sha256 of returned text). This is best-effort and never interrupts a tool call.

After the agent loop ends, `collect_run(session)` execs the host-driven `__collect__` command
inside the sandbox (not an agent tool — the driver calls it directly):

```
python -m research_agentic.sandbox_runtime __collect__
```

This reads the run workspace (submitted findings in `findings/`, the `trace.jsonl`, and any
`write_artifact` files) and returns them as a single JSON object. `collect_run` parses this
into a `RunArtifacts` dataclass (findings + trace + artifact paths). Fail-loud: a non-zero
exit or unparseable output raises `SandboxOperationalError`.

### OpenAI secret on the sandbox

`SandboxSession` defaults to `modal.Secret.from_name("permitpilot-openai")` so the
in-sandbox `web_search` (which calls the OpenAI Responses API) works without explicit
configuration. Pass `secrets=[]` to opt out (for a no-network tool-only sandbox).

### Live smoke result (Phase 2 acceptance)

The live smoke (`scripts/smoke_researcher.py`) ran a real VCAPCD Rule 23 / graphic-arts
hypothesis in a real `modal.Sandbox`. The researcher executed a 13-tool-call open-discovery
loop (`read_skill` → `web_search` → `web_fetch` → `browser_use` → `submit_finding`) and
produced a grounded finding:

- Confidence: 0.83
- Sources: `vcapcd.org` Rule 23 PDF + Rule 10 PDF (primary authority)
- Correctly flagged the missing ROC-emission-records fact rather than guessing a yes/no

Result: `SMOKE: PASS`.

---

## Phase 3 prerequisites / known follow-ups

These items were surfaced by the Phase 2 live smoke. They are documented here for Phase 3
planning; they do NOT affect single-researcher runs today.

### Async Modal I/O for concurrency

`run_tool`, `store.collect_run`, and `SandboxSession.__enter__`/`__exit__` call **blocking**
Modal APIs inside the async `drive()` coroutine. Modal emits `AsyncUsageWarning` for this
pattern. For a single researcher this is harmless (the event loop blocks briefly). Phase 3's
concurrent orchestrator (multiple `drive()` coroutines running in parallel) must wrap these
in `asyncio.to_thread(...)` or switch to Modal's `.aio()` async variants so researchers
actually run in parallel rather than serializing on the event loop.

### Sandbox image determinism + slimming

`build_sandbox_image()` uses `add_local_dir(_REPO_ROOT/"research_agentic")` which copies the
whole directory including `.venv`, `.tmp`, and `tests` — harmless bloat for a cached image.
However, the host-side otel trace file (`./.tmp/research_agentic_traces.jsonl` from
`researcher.yml`'s telemetry config) sits inside the copied dir. On concurrent runs this
causes a `modal.ExecutionError: ... modified during build process` race. Phase 3 fix: add
`ignore=[".venv", ".tmp", "tests", "**/__pycache__"]` to the `add_local_dir` call and/or
relocate the otel `output_path` outside the package directory (e.g. `../../.tmp/...`).

### Smoke invocation

Use the `-m` module form:

```bash
.venv/bin/python -m research_agentic.scripts.smoke_researcher
```

A bare `python research_agentic/scripts/smoke_researcher.py` skips the editable `.pth` in
this venv and raises `ModuleNotFoundError`. Prepend `PYTHONPATH=$(pwd)` to use the script
form directly.

---

## Phase 3+ (deferred)

The following items are explicitly deferred and are NOT in Phases 1–2:

- **Playwright + chromium in the sandbox image** — `browser_use`'s live path requires
  Playwright; the image slot and the tool body are in place, but the live path is a Phase 3
  item (the `browser_use` unit test covers the offline/not-installed branch).
- **`read_skill` hypothesis-fallback** — the skill reader currently loads a skill by exact
  `skill_id`; the "pick the best skill for this hypothesis" fallback logic depends on the
  skill registry, which is a Phase 3 concern.
- **Async Modal I/O + image determinism** — see "Phase 3 prerequisites" above.
- **Injection-quarantine test** — fetched content is structurally quarantined (returned as
  DATA in a result dict, never executed); the explicit adversarial test (a page crafted to
  escape the sandbox) belongs in Phase 3 alongside the senior verifier and agent context.

**Orchestration agent** (decompose/spawn/dispatch researchers in parallel), **senior verifier
agent** (L1 agentic judgment), **grounding floor** (L2 — mechanical verbatim-quote check),
**recall checklist** (L3 — known-program coverage), **output assembly** (`output.py`), and
artifact **persistence** (Supabase/Modal volume) are all Phase 3.

**Modal endpoint deployment**, **Node `orchestrateClient` cutover**, and **`nat eval`
scorecard** for the agentic core are Phase 4.
