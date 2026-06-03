# Rest of Sub-project C — Optimizer + Observability Backend — Design

**Status:** Design (brainstormed 2026-06-02)
**Depends on:** Sub-project C slice 1 (eval + profiler foundation) — `research_aiq`'s eval, evaluators, `eval_report.py`/scorecard, and the `record_run` epilogue. Stacked on `feat/eval-profiler-foundation` (PR #4, not yet merged).

## Goal

Complete sub-project C with its two remaining facets: (1) a **durable observability backend** that persists run-level metrics + eval scorecards to **Supabase** (queryable via the Supabase console), and (2) a **focused optimizer** that compares a few orchestration-model configs through the slice-1 eval/scorecard and recommends the cost-optimal one that still holds the recall/grounding floors.

## Context

Slice 1 produced an AIQ-native eval: a 12-scope dataset, three evaluators (`expected_program_recall` + `grounding_faithfulness` = primary/rigorous, `determination_accuracy` = directional), nat's profiler, and `eval_report.py` → a committed `scorecard.md`/`.json` (recall/grounding ≈ 1.0, directional accuracy, derived cost/latency). The `orchestrate` epilogue already computes run-level metrics and calls `observability.record_run` (fail-soft, to the local Raindrop Workshop).

Two relevant findings: **AIQ has no native model/prompt optimizer** (only `nat eval` and `nat sizing`, the latter being GPU-cluster sizing — irrelevant to our OpenAI-API + Modal-serverless setup), so the optimizer must be a custom eval-driven harness. And **Supabase is configured** for this clone (`SUPABASE_URL`/`SUPABASE_SERVICE_KEY` in `.env.local`, a `supabase/migrations/` dir, and a Supabase MCP) — the natural durable backend.

## Principles / decisions (from brainstorming, all confirmed)

1. **Two independent facets, one combined spec; the plan is two phases** — Phase A (Supabase persistence backend) first, then Phase B (optimizer), because the optimizer persists its comparison scorecards through the persistence layer.
2. **Optimizer = focused config comparison**, not a full sweep: compare the **orchestration model** (`gpt-5.2`, `gpt-5.5`, `gpt-4o-mini`) over a small **representative scope subset** (configurable, default ~3–4 scopes) to bound live cost.
3. **Quality differentiator is cost + grounding depth.** `expected_program_recall` + `grounding_faithfulness` are ~1.0 for *every* model (the mechanism guarantees them), so the optimizer leads with **cost** vs. **grounding depth** (`determination_accuracy` directional + `n_verified` — how many programs a model actually grounds vs. defers to `needs_review`), with the floors shown as constant.
4. **Observability = Supabase tables + console** — no custom dashboard UI.
5. **Persistence via httpx → Supabase PostgREST** (`SUPABASE_URL/rest/v1/<table>`) — **no new dependency** (httpx is already in). Strictly **fail-soft** (no Supabase env → no-op; any error logged, never raised — the same contract as the Raindrop `record_run`).
6. **The optimizer recommends; a human decides** — no auto-applying the chosen config.

## Architecture

Two facets sharing a thin persistence layer, all built on slice 1. New files (in the `research_aiq` package): `persistence.py`, `optimize.py`, and a Supabase migration. The `orchestrate` epilogue and `eval_report.main` gain fail-soft persistence calls.

```
PHASE A — observability backend
  orchestrate epilogue ── record_run (Raindrop) + persist_run (Supabase research_runs)
  eval_report.main ────── persist_scorecard (Supabase eval_scorecards)
  (query/trend via the Supabase console)

PHASE B — optimizer (focused model comparison)
  optimize.py: for model in [gpt-5.2, gpt-5.5, gpt-4o-mini]:
      run eval over a representative scope subset with that model
        → eval_report scorecard → persist_scorecard
  → build_comparison + recommend_cost_optimal → committed optimize_report.md/json
```

## Components

### 1. Supabase migration (Phase A) — `supabase/migrations/<timestamp>_research_observability.sql`
Two tables (applied via the Supabase MCP `apply_migration` or the supabase CLI):
- `research_runs`: `run_id text`, `ts timestamptz default now()`, `model text`, `status text`, `n_determinations int`, `n_verified int`, `n_needs_review int`, `n_investigated int`, `n_invariant_violations int`.
- `eval_scorecards`: `id bigserial pk`, `ts timestamptz default now()`, `model text`, `reps int`, `n_items int`, `recall float8`, `grounding float8`, `accuracy float8`, `total_cost_usd float8`, `cost_per_determination_p50_usd float8`, `cost_per_determination_p95_usd float8`, `spawn_latency_avg_ms float8`, `spawn_latency_p95_ms float8`.

### 2. `persistence.py` (Phase A) — `research_aiq/research_aiq/persistence.py`
- `persist_run(run_id: str, metrics: dict) -> None` and `persist_scorecard(scorecard: dict, meta: dict) -> None`.
- Each builds a row payload (pure builder functions, unit-tested) and POSTs to `{SUPABASE_URL}/rest/v1/<table>` with headers `apikey` + `Authorization: Bearer {SUPABASE_SERVICE_KEY}` + `Content-Type: application/json`, via `httpx` (short timeout).
- **Fail-soft (non-negotiable):** if `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are unset → silent no-op; any HTTP/exception → single logged warning, returns `None`, NEVER raises. (Mirrors `observability.record_run`; persistence must never affect a determination run or an eval.)

### 3. Wiring (Phase A)
- `orchestrate` epilogue: call `persist_run(run_id, metrics)` alongside the existing `record_run(run_id, metrics)` (inside the same fail-soft try/except; the determinations are returned regardless).
- `eval_report.main`: after writing the scorecard, call `persist_scorecard(scorecard_dict, meta)` (fail-soft).

### 4. `optimize.py` (Phase B) — `research_aiq/research_aiq/optimize.py`
- `CANDIDATE_MODELS = ["gpt-5.2", "gpt-5.5", "gpt-4o-mini"]` and a default representative scope subset (configurable; ~3–4 dataset ids).
- For each model: run the eval over the subset with `OPENAI_ORCHESTRATION_MODEL` set to that model (subprocess `nat eval` with a subset dataset + the env override, into a per-model output dir), build the scorecard via `eval_report`, and `persist_scorecard`.
- **Pure, unit-tested logic:** `build_comparison(scorecards: list[dict]) -> dict` (per-model rows) and `recommend_cost_optimal(scorecards, recall_floor=1.0, grounding_floor=1.0) -> str` (cheapest model whose recall & grounding meet the floors; tiebreak by grounding depth / directional accuracy).
- Emit a committed `optimize_report.md` (+ `.json`): a per-model table (cost, cost-per-determination, directional accuracy, n_verified, recall, grounding) + the recommendation + a note that recall/grounding are mechanism-constant.

## Data flow

`orchestrate` run → epilogue computes metrics → `record_run` (Raindrop) + `persist_run` (Supabase `research_runs`). `nat eval` → `eval_report` scorecard → `persist_scorecard` (Supabase `eval_scorecards`). `optimize.py` → N per-model scorecards (each persisted) → comparison + recommendation report.

## Testing

- **Unit (in the gate, no network):**
  - `persistence.py`: pure payload builders (correct row shape from metrics/scorecard) + fail-soft (no-env → no-op; injected failing client → returns None, no raise), mirroring `test_observability.py`.
  - `optimize.py`: `build_comparison` + `recommend_cost_optimal` over hand-built sample scorecards (cheapest-at-floors; a model that misses a floor is excluded; tiebreak by grounding depth).
- **Migration:** apply via the Supabase MCP and confirm both tables exist (one-time, offline).
- **Live smokes (offline, manual):** after one `orchestrate`/`eval` run, confirm a row lands in `research_runs`/`eval_scorecards` (Supabase console); run `optimize.py` over the subset and confirm the committed report + persisted per-model scorecards.
- Production unit gate (`pytest` + `ruff`) stays green; Supabase + live eval are offline, not in the gate.

## Error handling

Persistence and the optimizer's persistence are **fail-soft** — they never block or fail a determination run or an eval (no Supabase env / network error → logged no-op). The migration is a one-time apply. The optimizer's live model runs are offline/manual with documented cost (N models × subset × reps). The pipeline's **fail-loud core is untouched**.

## Success criteria

- The migration creates `research_runs` + `eval_scorecards` in Supabase.
- After an `orchestrate` run, a `research_runs` row is present (verifiable in the console); after an eval, an `eval_scorecards` row is present.
- `optimize.py` produces a committed comparison report across ≥2 models with a cost-optimal recommendation honoring the floors, and persists each model's scorecard.
- Unit tests (persistence payload + fail-soft; optimizer comparison/recommendation) pass; the production unit gate is green.

## Non-goals (this phase)

- Custom dashboard UI (Supabase console only).
- A full config sweep (focused model comparison only — no prompt/concurrency grid).
- Auto-applying the optimizer's recommendation (it recommends; a human decides).
- Per-scope disposition curation; sub-project D (Node thin-client cutover).

## Follow-ups (later)

1. A custom Next.js dashboard over the Supabase tables (trends, drill-down).
2. A fuller optimizer sweep (prompt variants, spawn batch/concurrency knobs; Pareto frontier).
3. Sub-project D (Node thin-client cutover).
