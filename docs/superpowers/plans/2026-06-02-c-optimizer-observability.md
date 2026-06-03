# Rest of Sub-project C — Optimizer + Observability Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete sub-project C: (Phase A) persist run-level metrics + eval scorecards to Supabase via a fail-soft layer, and (Phase B) a focused optimizer that compares orchestration models through the slice-1 eval/scorecard and recommends the cost-optimal one that holds the recall/grounding floors.

**Architecture:** Extends `research_aiq` in-place. A new fail-soft `persistence.py` (stdlib `urllib`, mirroring `observability.py`) writes rows to two new Supabase tables via PostgREST; it's wired into the `orchestrate` epilogue (next to `record_run`) and `eval_report.main`. A new `optimize.py` runs the eval per candidate model over a small scope subset, persists each scorecard, and emits a committed comparison report. Build Phase A first (the optimizer persists through it).

**Tech Stack:** Python ≥ 3.11, `uv`, `research_aiq` (slice 1: eval + `eval_report.py`), Supabase (PostgREST + the Supabase MCP for the migration), `pytest`, `ruff`. Live optimizer/persistence smokes use OpenAI (`gpt-5.x`) + Modal.

---

## Reference: spec
`docs/superpowers/specs/2026-06-02-c-optimizer-observability-design.md`. Read it first.

## Reference: environment + reliable invocation
- `research_aiq` outer dir `/Users/mac/Documents/permitos/research_aiq` (cwd for commands); inner package `research_aiq/research_aiq/`; tests `research_aiq/tests/`. Branch `feat/c-optimizer-observability` (stacked on slice-1's `feat/eval-profiler-foundation`). Do NOT switch branches; do NOT commit `.env.local`, `.tmp/`, `uv.lock`, `.venv/`, repo-root `package-lock.json`, or any `...-design 2.md` cloud-sync dup.
- **Reliable invocation (`uv run` is flaky; heavy `[profiler]` extra → first install slow):**
  ```bash
  cd /Users/mac/Documents/permitos/research_aiq
  uv pip install -e . -e ../research_core >/dev/null 2>&1
  PYTHONPATH="$PWD:$PWD/../research_core" .venv/bin/python -m pytest -q
  ```
- **Secrets (load WITHOUT echoing):** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (Phase A live smoke); plus `OPENAI_API_KEY`, `MODAL_RESEARCH_ENDPOINT`, `MODAL_RESEARCH_TOKEN`, `OPENAI_ORCHESTRATION_MODEL`, `RAINDROP_LOCAL_DEBUGGER` (live runs). Load:
  ```bash
  for v in SUPABASE_URL SUPABASE_SERVICE_KEY OPENAI_API_KEY MODAL_RESEARCH_ENDPOINT MODAL_RESEARCH_TOKEN OPENAI_ORCHESTRATION_MODEL RAINDROP_LOCAL_DEBUGGER; do
    export $v="$(grep -E "^$v=" /Users/mac/Documents/permitos/.env.local | cut -d= -f2- | tr -d '"')"; done
  ```
- Live `nat` runs need the `PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python` prefix.

## Reference: what you build on (slice 1, already on this branch)
- `research_aiq/research_aiq/observability.py` — `record_run(run_id, metrics)`: fail-soft, stdlib `urllib` POST, a pure `build_payload`. **Mirror this module's structure for `persistence.py`.**
- `research_aiq/research_aiq/functions/orchestrate.py` — its epilogue (the single guarded `try:` block) builds `metrics = {status, n_determinations, n_verified, n_needs_review, n_investigated, n_invariant_violations, invariant_violations, model}` and calls `record_run(run_id, metrics)` at the end. `persist_run` joins it there.
- `research_aiq/research_aiq/eval_report.py` — `build_scorecard(data) -> Scorecard`; `main(output_dir, out_md, out_json, date=None)` writes `out_md` + a JSON sidecar dict with keys: `evaluators_primary` (`{expected_program_recall, grounding_faithfulness}`), `evaluators_directional` (`{determination_accuracy}`), `aggregate` (`{n_runs, total_cost_usd, mean_cost_per_run_usd, cost_per_determination_p50_usd, cost_per_determination_p95_usd}`), `spawn_latency_ms` (`{avg_ms, p95_ms, usage_count}` | None), `spawn_researchers_calls_per_run`, `unpriced_models`. `main` derives `model` from `data["runs"][0]["model"]`. `persist_scorecard` consumes this sidecar dict.
- `research_aiq/tests/test_observability.py` — the fail-soft test pattern to mirror for `test_persistence.py`.

## File Structure
```
supabase/migrations/<timestamp>_research_observability.sql   # CREATE: research_runs + eval_scorecards
research_aiq/research_aiq/persistence.py                      # CREATE: fail-soft Supabase writers (urllib)
research_aiq/research_aiq/optimize.py                         # CREATE: comparison logic + runner + CLI
research_aiq/research_aiq/functions/orchestrate.py            # MODIFY: persist_run in the epilogue
research_aiq/research_aiq/eval_report.py                      # MODIFY: persist_scorecard in main()
research_aiq/research_aiq/eval/optimize_report.md             # CREATE (Phase B live run; committed)
research_aiq/research_aiq/eval/optimize_report.json           # CREATE (Phase B live run; committed)
research_aiq/tests/test_persistence.py                        # CREATE
research_aiq/tests/test_optimize.py                           # CREATE
research_aiq/tests/test_orchestrate.py                        # MODIFY: assert persist_run wired
research_aiq/tests/test_eval_report.py                        # MODIFY: assert persist_scorecard wired
research_aiq/README.md                                        # MODIFY: observability + optimizer sections
```

---

## Phase A — Observability backend

### Task 1: Supabase migration (two tables)

**Files:** Create `supabase/migrations/<timestamp>_research_observability.sql`

- [ ] **Step 1: Write the migration SQL** (filename: `supabase/migrations/$(date +%Y%m%d%H%M%S)_research_observability.sql`)
```sql
create table if not exists public.research_runs (
  id bigserial primary key,
  run_id text not null,
  ts timestamptz not null default now(),
  model text,
  status text,
  n_determinations int,
  n_verified int,
  n_needs_review int,
  n_investigated int,
  n_invariant_violations int
);

create table if not exists public.eval_scorecards (
  id bigserial primary key,
  ts timestamptz not null default now(),
  model text,
  n_runs int,
  recall double precision,
  grounding double precision,
  accuracy double precision,
  total_cost_usd double precision,
  cost_per_determination_p50_usd double precision,
  cost_per_determination_p95_usd double precision,
  spawn_latency_avg_ms double precision,
  spawn_latency_p95_ms double precision
);
```

- [ ] **Step 2: Apply the migration to Supabase**
Use the Supabase MCP (`ToolSearch` for `mcp__*__apply_migration`, then call it with `name: "research_observability"`, `query:` the SQL above; the project ref is the subdomain of `SUPABASE_URL`, e.g. `https://<ref>.supabase.co`). If the MCP needs a `project_id`, list projects (`mcp__*__list_projects`) and match the ref from `SUPABASE_URL`. (Alternative: `supabase db push` if the CLI is linked.)

- [ ] **Step 3: Verify both tables exist**
Via the MCP `list_tables` (schema `public`) or `execute_sql` `select count(*) from public.research_runs; select count(*) from public.eval_scorecards;` → both return 0 (empty, exist). Record the project ref used.

- [ ] **Step 4: Commit**
```bash
cd /Users/mac/Documents/permitos && git add supabase/migrations && git commit -m "feat(c): supabase migration — research_runs + eval_scorecards tables"
```

### Task 2: `persistence.py` (fail-soft Supabase writers)

**Files:** Create `research_aiq/research_aiq/persistence.py`, `research_aiq/tests/test_persistence.py`

- [ ] **Step 1: Write failing tests** `research_aiq/tests/test_persistence.py`
```python
import research_aiq.persistence as p


def test_build_run_row_shape():
    metrics = {"status": "needs_review", "n_determinations": 10, "n_verified": 3,
               "n_needs_review": 7, "n_investigated": 10, "n_invariant_violations": 0,
               "model": "gpt-5.2", "invariant_violations": []}
    row = p.build_run_row("run-x", metrics)
    assert row == {"run_id": "run-x", "model": "gpt-5.2", "status": "needs_review",
                   "n_determinations": 10, "n_verified": 3, "n_needs_review": 7,
                   "n_investigated": 10, "n_invariant_violations": 0}


def test_build_scorecard_row_shape():
    sidecar = {
        "evaluators_primary": {"expected_program_recall": 1.0, "grounding_faithfulness": 1.0},
        "evaluators_directional": {"determination_accuracy": 0.62},
        "aggregate": {"n_runs": 12, "total_cost_usd": 0.15,
                      "cost_per_determination_p50_usd": 0.002, "cost_per_determination_p95_usd": 0.004},
        "spawn_latency_ms": {"avg_ms": 19000.0, "p95_ms": 54000.0, "usage_count": 19},
    }
    row = p.build_scorecard_row(sidecar, "gpt-5.2")
    assert row["model"] == "gpt-5.2"
    assert row["n_runs"] == 12
    assert row["recall"] == 1.0 and row["grounding"] == 1.0 and row["accuracy"] == 0.62
    assert row["total_cost_usd"] == 0.15
    assert row["cost_per_determination_p50_usd"] == 0.002
    assert row["spawn_latency_avg_ms"] == 19000.0 and row["spawn_latency_p95_ms"] == 54000.0


def test_persist_run_no_env_is_noop(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    assert p.persist_run("run-x", {"model": "gpt-5.2"}) is None  # no raise


def test_persist_scorecard_failsoft_on_post_error(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "k")
    def boom(table, row):
        raise OSError("network down")
    monkeypatch.setattr(p, "_post_row", boom)
    assert p.persist_scorecard({"aggregate": {}}, "gpt-5.2") is None  # swallowed, no raise
```

- [ ] **Step 2: Run → fail** (`cd .../research_aiq && PYTHONPATH=... .venv/bin/python -m pytest tests/test_persistence.py -q`) — ModuleNotFoundError.

- [ ] **Step 3: Implement `research_aiq/research_aiq/persistence.py`** (mirror `observability.py`'s fail-soft structure, stdlib `urllib`)
```python
"""Fail-soft Supabase persistence for run-level metrics + eval scorecards.

The inverse of the pipeline's fail-LOUD core, exactly like observability.record_run:
durable telemetry that must NEVER raise, block, or slow a run/eval. Writes rows to
two PostgREST tables (research_runs, eval_scorecards) via stdlib urllib (no new dep).
If SUPABASE_URL / SUPABASE_SERVICE_KEY are unset, every call is a silent no-op.

Header last reviewed: 2026-06-02
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any

logger = logging.getLogger("research_aiq.persistence")

_URL_ENV = "SUPABASE_URL"
_KEY_ENV = "SUPABASE_SERVICE_KEY"
_TIMEOUT_SECONDS = 3.0


def build_run_row(run_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
    """Pure: map orchestrate's run metrics to a research_runs row."""
    return {
        "run_id": run_id,
        "model": metrics.get("model"),
        "status": metrics.get("status"),
        "n_determinations": metrics.get("n_determinations"),
        "n_verified": metrics.get("n_verified"),
        "n_needs_review": metrics.get("n_needs_review"),
        "n_investigated": metrics.get("n_investigated"),
        "n_invariant_violations": metrics.get("n_invariant_violations"),
    }


def build_scorecard_row(sidecar: dict[str, Any], model: str | None) -> dict[str, Any]:
    """Pure: map eval_report's scorecard sidecar dict to an eval_scorecards row."""
    primary = sidecar.get("evaluators_primary", {}) or {}
    directional = sidecar.get("evaluators_directional", {}) or {}
    agg = sidecar.get("aggregate", {}) or {}
    lat = sidecar.get("spawn_latency_ms") or {}
    return {
        "model": model,
        "n_runs": agg.get("n_runs"),
        "recall": primary.get("expected_program_recall"),
        "grounding": primary.get("grounding_faithfulness"),
        "accuracy": directional.get("determination_accuracy"),
        "total_cost_usd": agg.get("total_cost_usd"),
        "cost_per_determination_p50_usd": agg.get("cost_per_determination_p50_usd"),
        "cost_per_determination_p95_usd": agg.get("cost_per_determination_p95_usd"),
        "spawn_latency_avg_ms": lat.get("avg_ms"),
        "spawn_latency_p95_ms": lat.get("p95_ms"),
    }


def _post_row(table: str, row: dict[str, Any]) -> int:
    """POST one row to {SUPABASE_URL}/rest/v1/{table}. Raises on transport error;
    the public persist_* wrappers swallow. Returns HTTP status."""
    base = os.environ[_URL_ENV].rstrip("/")
    key = os.environ[_KEY_ENV]
    data = json.dumps(row).encode("utf-8")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    request = urllib.request.Request(  # noqa: S310 - fixed https supabase endpoint
        f"{base}/rest/v1/{table}", data=data, headers=headers, method="POST"
    )
    with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as resp:  # noqa: S310
        return int(resp.status)


def _persist(table: str, row: dict[str, Any], what: str) -> None:
    if not (os.environ.get(_URL_ENV) and os.environ.get(_KEY_ENV)):
        logger.debug("Supabase persistence skipped (%s/%s unset)", _URL_ENV, _KEY_ENV)
        return None
    try:
        status = _post_row(table, row)
        if not (200 <= status < 300):
            logger.warning("Supabase %s returned HTTP %s (ignored)", what, status)
    except Exception as exc:  # noqa: BLE001 - fail-soft is the whole contract
        logger.warning("Supabase %s failed (ignored): %s", what, exc)
    return None


def persist_run(run_id: str, metrics: dict[str, Any]) -> None:
    """Fail-soft: write a research_runs row. Never raises."""
    return _persist("research_runs", build_run_row(run_id, metrics), f"run {run_id}")


def persist_scorecard(sidecar: dict[str, Any], model: str | None) -> None:
    """Fail-soft: write an eval_scorecards row. Never raises."""
    return _persist("eval_scorecards", build_scorecard_row(sidecar, model), "scorecard")
```

- [ ] **Step 4: Run → pass** (`pytest tests/test_persistence.py -q` → 4 passed) + full suite.

- [ ] **Step 5: Commit**
```bash
cd /Users/mac/Documents/permitos && git add research_aiq/research_aiq/persistence.py research_aiq/tests/test_persistence.py && git commit -m "feat(c): fail-soft Supabase persistence layer (persist_run + persist_scorecard)"
```

### Task 3: Wire persistence into orchestrate + eval_report

**Files:** Modify `research_aiq/research_aiq/functions/orchestrate.py`, `research_aiq/research_aiq/eval_report.py`, `research_aiq/tests/test_orchestrate.py`, `research_aiq/tests/test_eval_report.py`

- [ ] **Step 1: Wire `persist_run` into the orchestrate epilogue**
In `orchestrate.py`: add the import `from research_aiq.persistence import persist_run` (next to the `record_run` import), and inside the existing fail-soft `try:` epilogue, immediately AFTER the `record_run(run_id, metrics)` line, add:
```python
            persist_run(run_id, metrics)
```
(Same `metrics` dict; inside the same guarded block so it stays fail-soft and never alters `final`. Do NOT touch the plan→supervise→finalize core.)

- [ ] **Step 2: Wire `persist_scorecard` into `eval_report.main`**
In `eval_report.py` `main()`: add `from research_aiq.persistence import persist_scorecard` (top of file), and AFTER `Path(out_json).write_text(json.dumps(sidecar, indent=2))`, add:
```python
    persist_scorecard(sidecar, model)
```
(`sidecar` + `model` already exist in `main`. `persist_scorecard` is itself fail-soft.)

- [ ] **Step 3: Update tests**
- In `tests/test_orchestrate.py`: the existing test already monkeypatches `record_run`; ALSO monkeypatch `research_aiq.functions.orchestrate.persist_run` to capture calls, and assert it's called once with the same `run_id` + metrics dict the run produced. In the existing fail-soft epilogue test, make `persist_run` raise and assert orchestrate still returns the determinations unchanged.
- In `tests/test_eval_report.py`: add a test that `main` calls `persist_scorecard` once — monkeypatch `research_aiq.eval_report.persist_scorecard`, run `main(_FIXTURE, tmp_md, tmp_json)`, assert it was called with a dict containing `aggregate` + the fixture's model.

- [ ] **Step 4: Run → pass** (`pytest -q` full suite green).

- [ ] **Step 5: Live persistence smoke** (needs Supabase + one live run; load env per the reference block)
```bash
cd /Users/mac/Documents/permitos/research_aiq
# scorecard persistence (no LLM cost — reuse the committed slice-1 output dir or the fixture):
PYTHONPATH="$PWD:$PWD/../research_core" .venv/bin/python -m research_aiq.eval_report \
  research_aiq/tests/fixtures/nat_eval_output /tmp/sc.md /tmp/sc.json
# run-level persistence (one live orchestrate run):
PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python PYTHONPATH="$PWD:$PWD/../research_core" \
  .venv/bin/python -m nat.cli.main run --config_file research_aiq/configs/workflow.yml \
  --input '{"facility":{"jurisdiction_stack":["SCAQMD"],"naics":null,"sic":null},"project_change":{"description":"Adding a coating booth and storing 60 gallons of a flammable solvent in Los Angeles County.","equipment":[{"kind":"coating_booth","description":""}],"chemicals":[{"name":"solvent","quantity":60,"unit":"gal"}],"waste_streams":[],"disturbance_acres":null,"process_discharge":false},"missing_facts":[],"assumptions":[]}' 2>&1 | tail -3
```
Then confirm rows landed (Supabase MCP `execute_sql`: `select count(*) from public.eval_scorecards; select run_id,model,status from public.research_runs order by ts desc limit 3;`). Record the row counts. (If Supabase is unreachable, the calls no-op fail-soft — note it; the wiring + unit tests still stand.)

- [ ] **Step 6: Commit**
```bash
cd /Users/mac/Documents/permitos && git add research_aiq/research_aiq/functions/orchestrate.py research_aiq/research_aiq/eval_report.py research_aiq/tests/test_orchestrate.py research_aiq/tests/test_eval_report.py && git commit -m "feat(c): wire fail-soft Supabase persistence into orchestrate + eval_report"
```

---

## Phase B — Optimizer (focused model comparison)

### Task 4: `optimize.py` — pure comparison + recommendation logic

**Files:** Create `research_aiq/research_aiq/optimize.py`, `research_aiq/tests/test_optimize.py`

- [ ] **Step 1: Write failing tests** `research_aiq/tests/test_optimize.py`
```python
from research_aiq.optimize import build_comparison, recommend_cost_optimal


def _result(model, recall, grounding, accuracy, total_cost, cpd_p50):
    return {"model": model, "scorecard": {
        "evaluators_primary": {"expected_program_recall": recall, "grounding_faithfulness": grounding},
        "evaluators_directional": {"determination_accuracy": accuracy},
        "aggregate": {"total_cost_usd": total_cost, "cost_per_determination_p50_usd": cpd_p50},
    }}


def test_build_comparison_one_row_per_model():
    results = [_result("gpt-5.2", 1.0, 1.0, 0.62, 0.15, 0.002),
               _result("gpt-5.5", 1.0, 1.0, 0.70, 0.55, 0.007)]
    rows = build_comparison(results)
    assert [r["model"] for r in rows] == ["gpt-5.2", "gpt-5.5"]
    assert rows[0]["total_cost_usd"] == 0.15 and rows[0]["accuracy"] == 0.62


def test_recommend_picks_cheapest_meeting_floors():
    results = [_result("gpt-5.2", 1.0, 1.0, 0.62, 0.15, 0.002),
               _result("gpt-5.5", 1.0, 1.0, 0.70, 0.55, 0.007)]
    # both meet floors → cheaper (gpt-5.2) wins
    assert recommend_cost_optimal(results) == "gpt-5.2"


def test_recommend_excludes_models_below_floor():
    results = [_result("cheapo", 1.0, 0.5, 0.40, 0.02, 0.0003),   # grounding below floor
               _result("gpt-5.2", 1.0, 1.0, 0.62, 0.15, 0.002)]
    assert recommend_cost_optimal(results) == "gpt-5.2"


def test_recommend_none_when_no_model_meets_floors():
    results = [_result("cheapo", 0.8, 0.5, 0.4, 0.02, 0.0003)]
    assert recommend_cost_optimal(results) is None
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement the pure logic in `research_aiq/research_aiq/optimize.py`**
```python
"""Focused optimizer: compare orchestration models via the slice-1 eval/scorecard
and recommend the cost-optimal one that still holds the recall/grounding floors.

AIQ has no native model/prompt optimizer (nat sizing is GPU-cluster sizing,
irrelevant to our OpenAI+Modal setup), so this is a custom eval-driven comparison.
recall + grounding are mechanism-constant (~1.0 for every model — the recall floor
and verifier guarantee them), so the real differentiator is COST + grounding depth
(directional accuracy). This module's comparison/recommendation logic is pure +
unit-tested; the live runner (run_comparison) drives `nat eval` per model.

Header last reviewed: 2026-06-02
"""
from __future__ import annotations

CANDIDATE_MODELS = ["gpt-5.2", "gpt-5.5", "gpt-4o-mini"]
# A small representative subset of dataset ids keeps the live comparison bounded.
DEFAULT_SUBSET = ["scope-scaqmd-coating-booth", "scope-grading-stormwater",
                  "scope-wastewater-pretreatment"]


def _row_from_result(result: dict) -> dict:
    sc = result["scorecard"]
    primary = sc.get("evaluators_primary", {}) or {}
    directional = sc.get("evaluators_directional", {}) or {}
    agg = sc.get("aggregate", {}) or {}
    return {
        "model": result["model"],
        "recall": primary.get("expected_program_recall"),
        "grounding": primary.get("grounding_faithfulness"),
        "accuracy": directional.get("determination_accuracy"),
        "total_cost_usd": agg.get("total_cost_usd"),
        "cost_per_determination_p50_usd": agg.get("cost_per_determination_p50_usd"),
    }


def build_comparison(results: list[dict]) -> list[dict]:
    """One comparison row per model result (preserves input order)."""
    return [_row_from_result(r) for r in results]


def recommend_cost_optimal(
    results: list[dict], recall_floor: float = 1.0, grounding_floor: float = 1.0
) -> str | None:
    """Cheapest model (by total_cost_usd) whose recall & grounding meet the floors.
    Tiebreak on higher directional accuracy (grounding depth). None if none qualify."""
    rows = build_comparison(results)
    eligible = [
        r for r in rows
        if (r["recall"] or 0) >= recall_floor and (r["grounding"] or 0) >= grounding_floor
    ]
    if not eligible:
        return None
    eligible.sort(key=lambda r: (r.get("total_cost_usd") or float("inf"),
                                 -(r.get("accuracy") or 0)))
    return eligible[0]["model"]
```

- [ ] **Step 4: Run → pass** (4 tests) + full suite.

- [ ] **Step 5: Commit**
```bash
cd /Users/mac/Documents/permitos && git add research_aiq/research_aiq/optimize.py research_aiq/tests/test_optimize.py && git commit -m "feat(c): optimizer comparison + cost-optimal recommendation logic"
```

### Task 5: `optimize.py` runner + CLI + live comparison + README + gate

**Files:** Modify `research_aiq/research_aiq/optimize.py`; Create `research_aiq/research_aiq/eval/optimize_report.md` + `.json`; Modify `research_aiq/README.md`

- [ ] **Step 1: Add the runner + report renderer + CLI to `optimize.py`**
Append:
```python
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from research_aiq.eval_report import build_scorecard, load_eval_output
from research_aiq.persistence import persist_scorecard

_PKG = Path(__file__).resolve().parent          # research_aiq/research_aiq
_DATASET = _PKG / "eval" / "dataset.json"
_CONFIG = _PKG / "configs" / "eval_config.yml"


def _subset_dataset(subset_ids: list[str], dest: str) -> None:
    data = json.loads(_DATASET.read_text())
    chosen = [d for d in data if d["id"] in subset_ids]
    Path(dest).write_text(json.dumps(chosen))


def run_comparison(models=None, subset=None, reps=1) -> list[dict]:
    """For each model: run `nat eval` over the subset with OPENAI_ORCHESTRATION_MODEL
    set, build its scorecard, persist it (fail-soft), and collect {model, scorecard}.
    Live + costly (models x subset x reps agentic runs); offline/manual."""
    models = models or CANDIDATE_MODELS
    subset = subset or DEFAULT_SUBSET
    repo_root = _PKG.parents[1]                  # research_aiq (outer dir)
    results: list[dict] = []
    with tempfile.TemporaryDirectory() as tmp:
        ds = f"{tmp}/subset.json"
        _subset_dataset(subset, ds)
        for model in models:
            out_dir = f"{tmp}/out-{model}"
            env = {**os.environ, "OPENAI_ORCHESTRATION_MODEL": model,
                   "PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION": "python",
                   "PYTHONPATH": f"{repo_root}:{repo_root.parent}/research_core"}
            subprocess.run(
                [sys.executable, "-m", "nat.cli.main", "eval",
                 "--config_file", str(_CONFIG), "--dataset", ds, "--reps", str(reps)],
                cwd=str(repo_root), env=env, check=True,
            )
            # nat writes to eval_config's output dir; point load_eval_output at it.
            sc = build_scorecard(load_eval_output(repo_root / ".tmp/nat/research_aiq_eval"))
            sidecar = {
                "evaluators_primary": sc.evaluators_primary,
                "evaluators_directional": sc.evaluators_directional,
                "aggregate": sc.aggregate,
                "spawn_latency_ms": sc.spawn_latency_ms,
            }
            persist_scorecard(sidecar, model)
            results.append({"model": model, "scorecard": sidecar})
    return results


def render_report_md(results: list[dict], recommendation: str | None) -> str:
    rows = build_comparison(results)
    lines = ["# Optimizer — orchestration model comparison", "",
             "recall + grounding are mechanism-constant (~1.0 every model); the "
             "differentiator is cost + grounding depth (directional accuracy).", "",
             "| model | recall | grounding | accuracy | total $ | $/determination (p50) |",
             "|---|---|---|---|---|---|"]
    for r in rows:
        lines.append(
            f"| {r['model']} | {r['recall']} | {r['grounding']} | {r['accuracy']} "
            f"| {r['total_cost_usd']} | {r['cost_per_determination_p50_usd']} |"
        )
    lines += ["", f"**Cost-optimal (holds recall=grounding=1.0): {recommendation or 'none'}**", ""]
    return "\n".join(lines)


def main(out_md: str, out_json: str) -> None:
    results = run_comparison()
    rec = recommend_cost_optimal(results)
    Path(out_md).write_text(render_report_md(results, rec))
    Path(out_json).write_text(json.dumps(
        {"comparison": build_comparison(results), "recommendation": rec}, indent=2))


if __name__ == "__main__":
    main(*sys.argv[1:])
```
(Move the imports to the top of the file when writing.) Add a unit test that `render_report_md` includes each model + the recommendation line (pure, over the Task-4 sample results) and commit it with this task.

- [ ] **Step 2: Run the live comparison** (costly — models × subset × reps; load env per the reference block)
```bash
cd /Users/mac/Documents/permitos/research_aiq
PYTHONPATH="$PWD:$PWD/../research_core" .venv/bin/python -m research_aiq.optimize \
  research_aiq/eval/optimize_report.md research_aiq/eval/optimize_report.json
cat research_aiq/eval/optimize_report.md
```
This runs `nat eval` for each of the 3 models over the 3-scope subset (9 agentic runs). If too slow/costly, reduce `CANDIDATE_MODELS` to 2 or `DEFAULT_SUBSET` to 2 (note which). Confirm each model's scorecard also persisted (Supabase `eval_scorecards`).

- [ ] **Step 3: Update the README** — add an "Observability backend" section (Supabase tables `research_runs`/`eval_scorecards`, fail-soft persistence, query via the Supabase console) and an "Optimizer" section (`python -m research_aiq.optimize <out_md> <out_json>`; focused model comparison; recall/grounding mechanism-constant so the lever is cost + grounding depth). Bump any `Header last reviewed:`.

- [ ] **Step 4: Production unit gate** (Supabase + live runs are offline, NOT in the gate)
```bash
cd /Users/mac/Documents/permitos/research_aiq
uv pip install -e . -e ../research_core >/dev/null 2>&1
PYTHONPATH="$PWD:$PWD/../research_core" .venv/bin/python -m ruff check . && PYTHONPATH="$PWD:$PWD/../research_core" .venv/bin/python -m ruff format --check .
PYTHONPATH="$PWD:$PWD/../research_core" .venv/bin/python -m pytest -q && echo C_REST_GREEN
```

- [ ] **Step 5: Commit**
```bash
cd /Users/mac/Documents/permitos && git add research_aiq/research_aiq/optimize.py research_aiq/tests/test_optimize.py research_aiq/research_aiq/eval/optimize_report.md research_aiq/research_aiq/eval/optimize_report.json research_aiq/README.md && git commit -m "feat(c): optimizer runner + CLI + live model comparison report; README"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** Supabase migration (research_runs + eval_scorecards) → T1; fail-soft persistence via urllib/PostgREST, no new dep → T2; wired into orchestrate epilogue + eval_report.main → T3; persist run-level metrics + scorecards → T2/T3; optimizer = focused model comparison reusing eval/scorecard → T4 (logic) + T5 (runner); cost-optimal recommendation holding floors → T4 `recommend_cost_optimal`; differentiator = cost + grounding depth → T4/T5 report; committed optimize_report → T5; Supabase-console dashboard (no UI) → no task needed (console is built-in); fail-soft contract → T2 (tests) + T3 (epilogue); unit gate green / live offline → T5 Step 4. Non-goals (custom UI, full sweep, auto-apply, D) correctly absent.

**Placeholder scan:** All code tasks (T2, T4) + wiring (T3) carry complete code. T1's migration SQL is complete; its apply/verify step names the Supabase MCP tools concretely (resolved at execution via ToolSearch, with the project ref from SUPABASE_URL) — an honest infra step, not a TODO. T5's runner is complete; the live-run numbers are produced by the run (not knowable at plan time), with the dataset/config paths pinned.

**Type consistency:** `build_run_row`/`build_scorecard_row`/`persist_run`/`persist_scorecard`/`_post_row`/`_persist` consistent across T2–T3. The scorecard sidecar keys (`evaluators_primary`/`evaluators_directional`/`aggregate`/`spawn_latency_ms`) match `eval_report.main`'s sidecar exactly. `build_comparison`/`recommend_cost_optimal`/`CANDIDATE_MODELS`/`DEFAULT_SUBSET`/`run_comparison`/`render_report_md` consistent across T4–T5; each result is `{"model", "scorecard": <sidecar dict>}` throughout. Note: the spec listed `eval_scorecards.reps`+`n_items`; this plan uses a single `n_runs` column (always present in the scorecard `aggregate`) — a deliberate simplification.

## Follow-ups (NOT in this plan)
1. Custom Next.js dashboard over the Supabase tables (trends, drill-down).
2. Fuller optimizer sweep (prompt variants, spawn batch/concurrency; Pareto frontier).
3. Sub-project D (Node thin-client cutover).
