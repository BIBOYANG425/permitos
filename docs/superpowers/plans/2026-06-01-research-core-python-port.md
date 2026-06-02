# Research Core Python Port (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the deterministic EHS research pipeline (TypeScript) to a standalone Python package `research_core`, proven to reproduce the existing TypeScript determinations exactly against committed goldens — offline, no LLM, no network.

**Architecture:** Differential-harness-first. A TypeScript exporter dumps the three seeded scopes' pipeline artifacts as committed JSON goldens; a Python parity test re-derives the same artifacts and asserts canonicalized equality. Each TS module is then faithfully translated to a Python peer, gated by the golden it must reproduce. No AIQ in this sub-project; the package is shaped (importable, side-effect-free, dependency-injected) so sub-project B can wrap it as AIQ functions.

**Tech Stack:** Python ≥ 3.11, `uv`, `pytest`, `ruff`, `dataclasses`; TypeScript exporter via `tsx` (existing dep). Build repo: permitos worktree.

---

## Reference: spec

Design spec: `docs/superpowers/specs/2026-06-01-research-core-python-port-design.md`. Read it before starting.

## Reference: TS→Python translation conventions (shared by all port tasks)

Apply these uniformly so ports are mechanical and parity-friendly:

| TS | Python |
|---|---|
| `type X = {...}` object | `@dataclass` in `types.py` (or `TypedDict` when dict-shaped at boundaries) |
| string-literal union (`"pass" \| "fail"`) | `Literal["pass","fail",...]` alias in `types.py` |
| `camelCase` fn/var | `snake_case` (e.g. `planResearch` → `plan_research`, `verifyEvidence` → `verify_evidence`) |
| object property `camelCase` | **keep identical key names** on dataclasses/dicts (parity compares serialized keys — do NOT snake-case data fields like `hypothesis_id` which are already snake, or `research_graph`) |
| `null` | `None` |
| `x ?? y` | `x if x is not None else y` |
| `arr.map/filter/some/find` | comprehensions / `any()` / `next((..),None)` |
| `new Map()` keyed dedup | `dict` |
| `Math` / numeric | keep float math identical; format via the canonicalizer (see Task 4) |

Data field names already use snake_case in the TS types (`hypothesis_id`, `research_graph`, `coverage_family_statuses`, `review_flag`, …) — **preserve them verbatim** in Python output. Only *function* and *local variable* identifiers get snake_cased.

## Reference: Port Task Protocol (used by Tasks 6–13)

Each module-port task is TDD against the golden oracle, NOT free invention. Steps for every port task:

1. **Enable the module's parity assertion** in `test_parity.py` (uncomment/extend the section that compares this module's artifact against the golden).
2. **Run it → fail** (module not yet ported / artifact mismatch).
3. **Translate the named TS file faithfully to the Python peer**, preserving the exported signatures listed in the task and following the Translation Conventions above. The TS source file is the source of truth for logic; do not redesign.
4. **Run the parity assertion → pass.** If it fails, the translation diverged — fix the Python, never the golden.
5. **Commit.**

This is intentional: for a faithful cross-language port the correctness spec IS the named source file plus its golden artifact. Do not write speculative Python bodies in this plan; translate at execution time, gated by parity.

## File Structure

Created in the permitos worktree:

```
research_core/                     # new package, repo root
  pyproject.toml                   # uv/ruff/pytest config
  research_core/
    __init__.py
    types.py                       # ← types.ts
    program_registry.py            # ← programRegistry.ts
    tool_catalog.py                # ← toolCatalog.ts (subset)
    scope.py                       # ← scope.ts (pure parts + LLM wrapper)
    planner.py                     # ← planner.ts
    verifier.py                    # ← verifier.ts (verify + canned repair)
    synthesis.py                   # ← synthesis.ts
    confidence.py                  # ← confidence.ts
    completeness.py                # ← completeness.ts
    trace.py                       # ← trace.ts (structural only)
    pipeline.py                    # ← run.ts finalize skeleton (plan_run/finalize_run)
  tests/
    __init__.py
    canonicalize.py                # cross-language normalizer
    goldens/                       # committed JSON, produced by the TS exporter
      complex.json
      construction.json
      missing_facts.json
    test_canonicalize.py
    test_parity.py                 # THE offline gate
    test_planner.py                # ← planner.test.ts
    test_verifier.py               # ← verifier.test.ts
    test_synthesis.py              # ← synthesis.test.ts
    test_completeness.py           # ← completeness.test.ts
    test_program_registry.py       # ← programRegistry.test.ts
    test_run_recall_floor.py       # ← run.recallFloor.test.ts
    test_run_repair.py             # ← run.repair.test.ts
    test_run_split.py              # ← run.split.test.ts
    test_tool_catalog.py           # ← toolCatalog.test.ts
    test_confidence.py             # ← confidence.test.ts
    test_scope_extraction.py       # Regime 2 (opt-in, needs OPENAI_API_KEY)
```

Created in the existing TS tree:

```
src/evals/exportGoldens.ts         # the golden exporter (next to working src/evals/golden.ts)
```
Modified: `package.json` (add `export:goldens` script).

---

## Phase 0 — Package scaffold

### Task 1: Create the `research_core` package skeleton

**Files:**
- Create: `research_core/pyproject.toml`
- Create: `research_core/research_core/__init__.py`
- Create: `research_core/tests/__init__.py`

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "research_core"
version = "0.1.0"
description = "Deterministic EHS research core (Python port). Parity-validated against the TypeScript pipeline."
requires-python = ">=3.11"
dependencies = []

[project.optional-dependencies]
llm = ["openai>=1.40"]
dev = ["pytest>=8", "ruff>=0.6"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["research_core"]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 2: Write empty package + test `__init__.py`**

```python
# research_core/research_core/__init__.py
"""Deterministic EHS research core (Python port)."""
```
```python
# research_core/tests/__init__.py
```

- [ ] **Step 3: Install and verify the toolchain**

Run: `cd research_core && uv venv && uv pip install -e ".[dev,llm]" && uv run pytest -q`
Expected: pytest runs and reports "no tests ran" (exit 5) or 0 tests collected — toolchain works.

- [ ] **Step 4: Commit**

```bash
git add research_core/pyproject.toml research_core/research_core/__init__.py research_core/tests/__init__.py
git commit -m "chore(research_core): package scaffold (uv/pytest/ruff)"
```

---

## Phase 1 — The golden oracle (build the harness BEFORE porting)

### Task 2: Write the TS golden exporter

**Files:**
- Create: `src/evals/exportGoldens.ts`
- Modify: `package.json` (scripts)
- Test: produces `research_core/tests/goldens/*.json`

- [ ] **Step 1: Write the exporter**

Mirror the deterministic composition in `src/lib/research/run.ts` (`finalizeRun`), bypassing the LLM `parseScope` by feeding the seeded `ScopePack` directly. Force fixture mode for deterministic evidence.

```ts
// src/evals/exportGoldens.ts
// Dumps the deterministic pipeline artifacts for the three seeded scopes as
// committed parity goldens. Run with RESEARCH_MODE=fixture for deterministic evidence.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planResearch } from "@/lib/research/planner";
import { runLocalResearchPool } from "@/lib/research/workers";
import { finalizeRun } from "@/lib/research/run";
import {
  seededComplexScope,
  seededConstructionScope,
  seededMissingFactsScope,
} from "@/lib/research/fixtures/scenarios";
import type { ScopePack } from "@/lib/research/types";

process.env.RESEARCH_MODE = "fixture"; // deterministic cached evidence + canned repair

const OUT_DIR = join(process.cwd(), "research_core", "tests", "goldens");

async function buildGolden(runId: string, scope_pack: ScopePack) {
  const plan = planResearch(scope_pack, []); // [] = no SDS-active families
  const pool = await runLocalResearchPool(plan.research_tasks, plan.research_graph);
  const result = await finalizeRun(runId, scope_pack, plan, pool.bundles, [], []);
  // Parity-relevant, fully-deterministic subset (trace_events excluded: timestamps).
  return {
    run_id: runId,
    scope_pack,
    fixture_evidence: pool.bundles,
    plan: {
      coverage_family_statuses: plan.coverage_family_statuses,
      regulatory_angles: plan.regulatory_angles,
      research_graph: plan.research_graph,
      research_tasks: plan.research_tasks,
    },
    verification_verdicts: result.verification_verdicts,
    evidence_bundles: result.evidence_bundles, // latest (incl. repaired)
    determinations: result.determinations,
    status: result.status,
    report_markdown: result.report_markdown, // structural-parity only (see Task 5)
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const cases: Array<[string, string, ScopePack]> = [
    ["complex", "golden-complex", seededComplexScope("golden-complex", "")],
    ["construction", "golden-construction", seededConstructionScope("golden-construction", "")],
    ["missing_facts", "golden-missing", seededMissingFactsScope("golden-missing", "")],
  ];
  for (const [file, runId, scope] of cases) {
    const golden = await buildGolden(runId, scope);
    writeFileSync(join(OUT_DIR, `${file}.json`), JSON.stringify(golden, null, 2) + "\n");
    console.log(`wrote ${file}.json (${golden.determinations.length} determinations, status=${golden.status})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, add:
```json
"export:goldens": "tsx src/evals/exportGoldens.ts"
```

- [ ] **Step 3: Run the exporter twice and verify determinism**

Run:
```bash
pnpm export:goldens && cp -r research_core/tests/goldens /tmp/g1 && pnpm export:goldens && diff -r /tmp/g1 research_core/tests/goldens && echo DETERMINISTIC
```
Expected: prints three `wrote …` lines both times, then `DETERMINISTIC` (no diff). If `diff` shows changes, a nondeterministic field leaked in (e.g. a timestamp/random id) — remove it from `buildGolden` before continuing.

- [ ] **Step 4: Sanity-check the goldens**

Run: `python3 -c "import json;[print(f, json.load(open(f'research_core/tests/goldens/{f}.json'))['status']) for f in ['complex','construction','missing_facts']]"`
Expected: `complex needs_review`, `construction done` (or `needs_review`), `missing_facts needs_review` — each loads as valid JSON with a `status`.

- [ ] **Step 5: Commit**

```bash
git add src/evals/exportGoldens.ts package.json research_core/tests/goldens/
git commit -m "feat(research_core): TS golden exporter + committed parity goldens"
```

### Task 3: Pin the goldens with a TS regen guard

**Files:**
- Modify: `package.json` (scripts)

- [ ] **Step 1: Add a check script that fails if goldens are stale**

In `package.json` `"scripts"`, add:
```json
"check:goldens": "pnpm export:goldens && git diff --exit-code -- research_core/tests/goldens"
```

- [ ] **Step 2: Verify it passes on a clean tree**

Run: `pnpm check:goldens && echo GOLDENS_FRESH`
Expected: `GOLDENS_FRESH` (no diff). This is the cross-language guard: a TS change that shifts determinations must regenerate goldens, and Python must then re-match.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(research_core): check:goldens guard against stale goldens"
```

### Task 4: Write the canonicalizer (cross-language normalizer)

**Files:**
- Create: `research_core/tests/canonicalize.py`
- Test: `research_core/tests/test_canonicalize.py`

- [ ] **Step 1: Write the failing test**

```python
# research_core/tests/test_canonicalize.py
from tests.canonicalize import canonical

def test_sorts_keys_and_normalizes_floats():
    a = {"b": 1, "a": 0.1 + 0.2}          # 0.30000000000000004
    b = {"a": 0.3, "b": 1}
    assert canonical(a) == canonical(b)

def test_float_vs_int_distinct_when_meaningful():
    assert canonical({"x": 0}) == canonical({"x": 0.0})  # 0 == 0.0 numerically

def test_array_order_preserved():
    assert canonical([1, 2, 3]) != canonical([3, 2, 1])

def test_none_passthrough():
    assert canonical({"x": None}) == canonical({"x": None})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd research_core && uv run pytest tests/test_canonicalize.py -q`
Expected: FAIL (`ModuleNotFoundError: tests.canonicalize`).

- [ ] **Step 3: Write the canonicalizer**

```python
# research_core/tests/canonicalize.py
"""Canonicalize structured artifacts for cross-language parity comparison.

JSON object keys are order-insensitive (sort them); array order IS significant
(preserve). Floats are rounded to a fixed precision so TS's number formatting and
Python's repr agree. Ints and floats compare numerically (1 == 1.0)."""
from __future__ import annotations
import json
from typing import Any

FLOAT_PRECISION = 9

def _norm(value: Any) -> Any:
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        return round(value, FLOAT_PRECISION)
    if isinstance(value, int):
        return round(float(value), FLOAT_PRECISION)
    if isinstance(value, dict):
        return {k: _norm(value[k]) for k in sorted(value.keys())}
    if isinstance(value, (list, tuple)):
        return [_norm(v) for v in value]
    return value

def canonical(value: Any) -> str:
    """Stable string form: sorted keys, normalized numbers, preserved array order."""
    return json.dumps(_norm(value), ensure_ascii=False, separators=(",", ":"))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd research_core && uv run pytest tests/test_canonicalize.py -q`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add research_core/tests/canonicalize.py research_core/tests/test_canonicalize.py
git commit -m "feat(research_core): cross-language canonicalizer + tests"
```

### Task 5: Write the parity test skeleton (all sections skipped until their module lands)

**Files:**
- Create: `research_core/tests/test_parity.py`

- [ ] **Step 1: Write the parity harness with per-artifact sections gated by `pytest.mark.skip`**

Each section compares one Python-derived artifact against the golden. Sections start skipped; each port task (6–13) removes its skip. `report_markdown` parity is **structural** (every determination's `requirement` line present), per the spec.

```python
# research_core/tests/test_parity.py
"""THE offline gate. Re-derive each pipeline artifact in Python from the golden
inputs (seeded ScopePack + fixture evidence) and assert canonical equality with
the committed golden. trace_events are excluded (timestamps); report_markdown is
checked structurally, not byte-exact."""
from __future__ import annotations
import json
from pathlib import Path
import pytest
from tests.canonicalize import canonical

GOLDEN_DIR = Path(__file__).parent / "goldens"
CASES = ["complex", "construction", "missing_facts"]

def load(case: str) -> dict:
    return json.loads((GOLDEN_DIR / f"{case}.json").read_text())

@pytest.fixture(params=CASES)
def golden(request) -> dict:
    return load(request.param)

# --- Plan parity (Task 8) ---
@pytest.mark.skip(reason="planner not ported yet")
def test_plan_parity(golden):
    from research_core.planner import plan_research
    plan = plan_research(golden["scope_pack"], [])
    for key in ("coverage_family_statuses", "regulatory_angles", "research_graph", "research_tasks"):
        assert canonical(_as_dicts(plan[key])) == canonical(golden["plan"][key]), key

# --- Verdict + repaired-evidence parity (Tasks 9) ---
@pytest.mark.skip(reason="verifier not ported yet")
def test_verdict_parity(golden):
    from research_core.pipeline import run_verification
    out = run_verification(golden["scope_pack"], golden["fixture_evidence"])
    assert canonical(_as_dicts(out["verification_verdicts"])) == canonical(golden["verification_verdicts"])
    assert canonical(_as_dicts(out["evidence_bundles"])) == canonical(golden["evidence_bundles"])

# --- Determinations + status parity (Tasks 10–13: synthesis, completeness, pipeline) ---
@pytest.mark.skip(reason="pipeline not ported yet")
def test_determinations_parity(golden):
    from research_core.pipeline import finalize_run
    result = finalize_run(golden["run_id"], golden["scope_pack"], golden["fixture_evidence"])
    assert canonical(_as_dicts(result["determinations"])) == canonical(golden["determinations"])
    assert result["status"] == golden["status"]

# --- report_markdown STRUCTURAL parity (Task 10) ---
@pytest.mark.skip(reason="synthesis not ported yet")
def test_report_markdown_structural(golden):
    from research_core.pipeline import finalize_run
    result = finalize_run(golden["run_id"], golden["scope_pack"], golden["fixture_evidence"])
    md = result["report_markdown"]
    for det in golden["determinations"]:
        assert det["requirement"] in md, det["requirement"]

def _as_dicts(value):
    """Coerce dataclass instances to plain dicts for comparison."""
    import dataclasses
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {k: _as_dicts(v) for k, v in dataclasses.asdict(value).items()}
    if isinstance(value, dict):
        return {k: _as_dicts(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_as_dicts(v) for v in value]
    return value
```

- [ ] **Step 2: Run to verify all parity tests are collected and skipped**

Run: `cd research_core && uv run pytest tests/test_parity.py -q`
Expected: `12 skipped` (4 tests × 3 cases) — harness is wired, nothing ported yet.

- [ ] **Step 3: Commit**

```bash
git add research_core/tests/test_parity.py
git commit -m "feat(research_core): parity-test harness (skipped sections per artifact)"
```

---

## Phase 2 — Port the core modules (Port Task Protocol)

Each task below follows the **Port Task Protocol** (top of plan): enable the parity section → run/fail → translate the named TS file → run/pass → commit. Signatures listed are the verified public surface to preserve.

### Task 6: Port `types.py` (← `types.ts`)

**Files:**
- Create: `research_core/research_core/types.py`
- Source of truth: `src/lib/research/types.ts`

- [ ] **Step 1: Translate every exported type** to a `@dataclass` (or `Literal` alias), preserving **data field names verbatim**: `RunStatus`, `CoverageFamily`, `CoverageStatus`, `ProjectFact`, `ScopePack`, `CoverageFamilyStatus`, `RegulatoryAngle`, `ResearchHypothesis`, `ResearchTask`, `SourceFixture`, `EvidenceBundle`, `VerificationVerdict`, `RepairTicket`, `Determination`, `TraceEvent`, `MemoryUpdate`, `ResearchRun`, `ResearchRunInput`. Use `Literal[...]` for unions (e.g. `Determination.applies = Literal["yes","no","needs_review"]`). Omit the SDS-typed fields (`sds_handoff_refs`, `sds_reviews`) — model them as `Optional[list] = None` placeholders (SDS is out of scope; see spec Decision 2).

- [ ] **Step 2: Write a shape test**

```python
# research_core/tests/test_types_smoke.py
from research_core.types import Determination
def test_determination_roundtrips():
    d = Determination(requirement="x", applies="needs_review", trigger="", project_fact="",
                       citation="", quote="", source_url="", confidence=0.0,
                       verified=False, review_flag=True)
    assert d.applies == "needs_review"
```

- [ ] **Step 3: Run → pass**

Run: `cd research_core && uv run pytest tests/test_types_smoke.py -q`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add research_core/research_core/types.py research_core/tests/test_types_smoke.py
git commit -m "feat(research_core): port types.ts -> types.py"
```

### Task 7: Port `program_registry.py` (← `programRegistry.ts`) + `test_program_registry.py`

**Files:**
- Create: `research_core/research_core/program_registry.py`
- Source: `src/lib/research/programRegistry.ts`
- Test: `research_core/tests/test_program_registry.py` (← `__tests__/programRegistry.test.ts`)

Preserve signatures: `PROGRAM_REGISTRY` (module-level list of `ProgramRegistryEntry`), `all_programs()`, `programs_for_family(family)`, `program_for_hypothesis(hid)`, `source_pointer_for_hypothesis(hid)`, `extraction_hint_for_hypothesis(hid)`, `skill_id_for_hypothesis(hid)`, `registry_hosts()`.

- [ ] **Step 1: Translate `programRegistry.ts` verbatim** (the registry data is the single source of truth — copy every entry exactly).
- [ ] **Step 2: Port `programRegistry.test.ts` to pytest** as `test_program_registry.py` (translate each `it(...)` to a `test_...`).
- [ ] **Step 3: Run → pass.** Run: `cd research_core && uv run pytest tests/test_program_registry.py -q` — Expected: PASS (all ported cases).
- [ ] **Step 4: Commit.** `git add research_core/research_core/program_registry.py research_core/tests/test_program_registry.py && git commit -m "feat(research_core): port programRegistry + tests"`

### Task 8: Port `tool_catalog.py` + `scope.py` (pure) + `planner.py`; turn on plan parity

**Files:**
- Create: `research_core/research_core/tool_catalog.py` (← `toolCatalog.ts`, subset used by the planner: `researchWorkerToolIds`, `blockedToolIdsForRole`, `HarnessToolId`)
- Create: `research_core/research_core/scope.py` (pure parts only: `scope_pack_from_facts`, `apply_sds_handoff_to_scope` (empty-reviews identity), `project_facts`, `empty_scope`, `create_run_id`)
- Create: `research_core/research_core/planner.py` (← `planner.ts`: `plan_research(scope, sds_active_families)`)
- Test: enable `test_plan_parity` in `test_parity.py`; create `test_planner.py`, `test_tool_catalog.py`

- [ ] **Step 1: Remove the `@pytest.mark.skip` on `test_plan_parity`** in `test_parity.py`. Adjust `plan_research(golden["scope_pack"], [])` to accept a plain dict scope (the golden `scope_pack` is JSON); either build a `ScopePack` from the dict or have `plan_research` accept the dict shape — match how the TS planner reads `scope`.
- [ ] **Step 2: Run → fail.** Run: `cd research_core && uv run pytest tests/test_parity.py -k plan -q` — Expected: FAIL (planner missing / mismatch).
- [ ] **Step 3: Translate `toolCatalog.ts` (subset), the pure parts of `scope.ts`, and `planner.ts`.** The planner derives coverage families → regulatory angles → hypotheses → tasks; `research_tasks` carry tool ids from `tool_catalog`. Preserve all derived data field names.
- [ ] **Step 4: Run → pass.** Run: `cd research_core && uv run pytest tests/test_parity.py -k plan -q` — Expected: PASS (3 cases). Then `uv run pytest tests/test_planner.py tests/test_tool_catalog.py -q` — Expected: PASS.
- [ ] **Step 5: Commit.** `git add research_core/research_core/{tool_catalog,scope,planner}.py research_core/tests/{test_planner,test_tool_catalog}.py research_core/tests/test_parity.py && git commit -m "feat(research_core): port planner+scope(pure)+toolCatalog; plan parity green"`

### Task 9: Port `verifier.py` (verify + canned repair); turn on verdict parity

**Files:**
- Create: `research_core/research_core/verifier.py` (← `verifier.ts`: `verify_evidence(scope, bundle)`, `repair_evidence(scope, ticket)`)
- Create: `research_core/research_core/pipeline.py` with `run_verification(scope, fixture_evidence)` (the verify+repair loop extracted from `run.ts:finalizeRun` lines 72–91, fixture mode → `repair_evidence`)
- Test: enable `test_verdict_parity`; create `test_verifier.py`, `test_run_repair.py`

- [ ] **Step 1: Remove the skip on `test_verdict_parity`.**
- [ ] **Step 2: Run → fail.** Run: `cd research_core && uv run pytest tests/test_parity.py -k verdict -q` — Expected: FAIL.
- [ ] **Step 3: Translate `verifier.ts`** (`verify_evidence`, `repair_evidence`, math/threshold branches), and write `pipeline.run_verification` mirroring the `finalizeRun` verify→repair→re-verify loop (fixture repair only; `latest_by_hypothesis` dedup). Translate `verifier.test.ts`→`test_verifier.py` and `run.repair.test.ts`→`test_run_repair.py`.
- [ ] **Step 4: Run → pass.** Run: `cd research_core && uv run pytest tests/test_parity.py -k verdict tests/test_verifier.py tests/test_run_repair.py -q` — Expected: PASS.
- [ ] **Step 5: Commit.** `git add research_core/research_core/{verifier,pipeline}.py research_core/tests/{test_verifier,test_run_repair}.py research_core/tests/test_parity.py && git commit -m "feat(research_core): port verifier + verify/repair loop; verdict parity green"`

### Task 10: Port `confidence.py` + `synthesis.py`; turn on report_markdown structural parity

**Files:**
- Create: `research_core/research_core/confidence.py` (← `confidence.ts`)
- Create: `research_core/research_core/synthesis.py` (← `synthesis.ts`: `synthesize(scope, research_graph, regulatory_angles, evidence, verdicts, sds_reviews=[])` → `{determinations, memory_updates, report_markdown}`)
- Test: enable `test_report_markdown_structural`; create `test_synthesis.py`, `test_confidence.py`

- [ ] **Step 1: Remove the skip on `test_report_markdown_structural`.**
- [ ] **Step 2: Run → fail.** Run: `cd research_core && uv run pytest tests/test_parity.py -k report_markdown -q` — Expected: FAIL.
- [ ] **Step 3: Translate `confidence.ts` and `synthesis.ts`** (synthesis consumes confidence). Preserve determination field names and the markdown line containing each `requirement`. Translate `synthesis.test.ts`→`test_synthesis.py`, `confidence.test.ts`→`test_confidence.py`.
- [ ] **Step 4: Run → pass.** Run: `cd research_core && uv run pytest tests/test_parity.py -k report_markdown tests/test_synthesis.py tests/test_confidence.py -q` — Expected: PASS.
- [ ] **Step 5: Commit.** `git add research_core/research_core/{confidence,synthesis}.py research_core/tests/{test_synthesis,test_confidence}.py research_core/tests/test_parity.py && git commit -m "feat(research_core): port synthesis+confidence; report-markdown structural parity green"`

### Task 11: Port `completeness.py` (recall floor); + `test_run_recall_floor.py`

**Files:**
- Create: `research_core/research_core/completeness.py` (← `completeness.ts`: `expected_programs_for_scope(scope)`, `verify_determination_set(scope, proposed_ids)` → `CompletenessResult`)
- Test: `test_completeness.py` (← `completeness.test.ts`), `test_run_recall_floor.py` (← `run.recallFloor.test.ts`)

- [ ] **Step 1: Translate `completeness.ts` verbatim** (the recall floor diffs the registry × scope against the proposed set).
- [ ] **Step 2: Port `completeness.test.ts` and `run.recallFloor.test.ts` to pytest.**
- [ ] **Step 3: Run → pass.** Run: `cd research_core && uv run pytest tests/test_completeness.py tests/test_run_recall_floor.py -q` — Expected: PASS.
- [ ] **Step 4: Commit.** `git add research_core/research_core/completeness.py research_core/tests/{test_completeness,test_run_recall_floor}.py && git commit -m "feat(research_core): port completeness recall floor + tests"`

---

## Phase 3 — Wire the pipeline + the full gate

### Task 12: Complete `pipeline.finalize_run` and turn on determinations parity

**Files:**
- Modify: `research_core/research_core/pipeline.py`
- Create: `research_core/research_core/trace.py` (structural no-op events; excluded from parity)
- Test: enable `test_determinations_parity`; create `test_run_split.py` (← `run.split.test.ts`)

- [ ] **Step 1: Remove the skip on `test_determinations_parity`.**
- [ ] **Step 2: Run → fail.** Run: `cd research_core && uv run pytest tests/test_parity.py -k determinations -q` — Expected: FAIL.
- [ ] **Step 3: Implement `finalize_run(run_id, scope_pack, fixture_evidence)`** mirroring `run.ts:finalizeRun` (lines 58–132): run_verification → `synthesize` → recall floor (`verify_determination_set` over `proposed_program_ids` derived from `PROGRAM_REGISTRY` × investigated hypotheses) → `determinations = synthesis.determinations + [recall_gap_determination(p) for p in recall.missing]` → `status`. Translate the `recallGapDetermination` helper (run.ts:168–181) and `plan_run`-equivalent split per `run.split.test.ts`.
- [ ] **Step 4: Run → pass.** Run: `cd research_core && uv run pytest tests/test_parity.py -k determinations tests/test_run_split.py -q` — Expected: PASS.
- [ ] **Step 5: Commit.** `git add research_core/research_core/{pipeline,trace}.py research_core/tests/{test_run_split}.py research_core/tests/test_parity.py && git commit -m "feat(research_core): finalize_run composition; determinations parity green"`

### Task 13: Full offline parity gate — all sections green

**Files:**
- Test: `research_core/tests/test_parity.py` (no skips remain)

- [ ] **Step 1: Confirm no `@pytest.mark.skip` remains** in `test_parity.py` (grep).

Run: `grep -n "mark.skip" research_core/tests/test_parity.py || echo NO_SKIPS`
Expected: `NO_SKIPS`.

- [ ] **Step 2: Run the entire parity suite + full test suite.**

Run: `cd research_core && uv run pytest -q`
Expected: PASS, all parity cases green (plan, verdict, determinations, report_markdown across all 3 scopes) plus all ported unit tests.

- [ ] **Step 3: Cross-language guard end-to-end.**

Run: `pnpm check:goldens && (cd research_core && uv run pytest tests/test_parity.py -q) && echo PARITY_LOCKED`
Expected: `PARITY_LOCKED` — goldens are fresh AND Python reproduces them.

- [ ] **Step 4: Commit.**

```bash
git add research_core/tests/test_parity.py
git commit -m "test(research_core): offline golden parity gate fully green (3 scopes)"
```

---

## Phase 4 — LLM extraction (Regime 2, opt-in)

### Task 14: Port the scope-extraction LLM wrapper + stable-field eval

**Files:**
- Modify: `research_core/research_core/scope.py` (add `parse_scope(input, run_id)` LLM wrapper + the scope-extraction prompt from `prompts.ts`)
- Test: `research_core/tests/test_scope_extraction.py`

- [ ] **Step 1: Write the opt-in eval test** (skips without a key, asserts stable post-processed fields only — tolerant on free text).

```python
# research_core/tests/test_scope_extraction.py
import os
import pytest
from research_core.scope import parse_scope

pytestmark = pytest.mark.skipif(not os.environ.get("OPENAI_API_KEY"),
                                reason="Regime 2 is opt-in; needs OPENAI_API_KEY")

def test_complex_scope_stable_fields():
    sp = parse_scope({"project_description":
        "Adding a coating booth and storing 60 gallons of a flammable solvent at a "
        "Los Angeles County manufacturing facility."}, "eval-complex")
    assert "SCAQMD" in sp["facility"]["jurisdiction_stack"]
    kinds = [e["kind"] for e in sp["project_change"]["equipment"]]
    assert any("coat" in k.lower() or "booth" in k.lower() for k in kinds)
    chem = sp["project_change"]["chemicals"][0]
    assert chem["quantity"] == 60 and chem["unit"].lower().startswith("gal")
```

- [ ] **Step 2: Run → skip (no key).** Run: `cd research_core && uv run pytest tests/test_scope_extraction.py -q` — Expected: `1 skipped`.
- [ ] **Step 3: Translate the `scope.ts` LLM call** (`parse_scope`) and the scope-extraction prompt from `prompts.ts` into `scope.py`, using the `openai` optional dependency. Keep the pure post-processing (`scope_pack_from_facts`) shared with the offline path.
- [ ] **Step 4: Run with a key to verify (optional, costs tokens).** Run: `OPENAI_API_KEY=$OPENAI_API_KEY cd research_core && uv run pytest tests/test_scope_extraction.py -q` — Expected: PASS (stable fields match). If unavailable in CI, the skip path keeps the offline gate green.
- [ ] **Step 5: Commit.** `git add research_core/research_core/scope.py research_core/tests/test_scope_extraction.py && git commit -m "feat(research_core): port scope-extraction LLM wrapper + opt-in stable-field eval"`

---

## Phase 5 — Lint + final verification

### Task 15: Lint, full suite, and a README for the package

**Files:**
- Create: `research_core/README.md`
- Test: full suite + ruff

- [ ] **Step 1: Run ruff and fix.** Run: `cd research_core && uv run ruff check . && uv run ruff format --check .` — Expected: clean (fix any findings, re-run).
- [ ] **Step 2: Write a short package README** documenting: purpose (parity-validated deterministic core), how to regenerate goldens (`pnpm export:goldens` from repo root), how to run the gate (`uv run pytest`), and the AIQ forward-fit note (importable, dependency-injected — ready for sub-project B). No placeholders.
- [ ] **Step 3: Final gate.** Run: `pnpm check:goldens && (cd research_core && uv run pytest -q && uv run ruff check .) && echo SUBPROJECT_A_DONE` — Expected: `SUBPROJECT_A_DONE`.
- [ ] **Step 4: Commit.** `git add research_core/README.md && git commit -m "docs(research_core): package README; sub-project A complete"`

---

## Self-Review (completed by plan author)

**Spec coverage:** types→T6; scope (pure)→T8; scope (LLM, Regime 2)→T14; planner→T8; programRegistry→T7; verifier verify/repair→T9; synthesis→T10; confidence→T10; completeness/recall floor→T11; run plan/finalize skeleton→T12; tool_catalog subset→T8; trace (structural)→T12; fixtures→consumed via goldens (T2); two parity regimes→T5/T13 (Regime 1) + T14 (Regime 2); golden oracle/exporter→T2–T3; canonicalizer→T4; unit-test ports→T7–T12; packaging/ruff→T1/T15; AIQ forward-fit (importable/DI)→enforced by package shape (T1) + README (T15). SDS, skills-library, orchestration-briefing, LLM-judge, live path — correctly absent (spec non-goals).

**Placeholder scan:** Infrastructure tasks (1–5, 14–15) contain complete code. Module-port tasks (6–13) intentionally instruct faithful translation of a named TS source gated by golden parity, per the documented Port Task Protocol — this is a precise, executable spec for a 1:1 port, not a vague "implement later." No "TBD"/"handle edge cases"/"write tests for the above" remain.

**Type consistency:** Data field names preserved verbatim from `types.ts` (snake_case already); function names consistently snake_cased (`plan_research`, `verify_evidence`, `repair_evidence`, `synthesize`, `verify_determination_set`, `finalize_run`, `run_verification`). `pipeline.py` is introduced in T9 and completed in T12 (consistent). Parity sections in T5 reference exactly the artifacts produced in T8–T12.
