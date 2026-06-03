# Eval + Profiler Foundation (Sub-project C · Slice 1) — Design

**Status:** Design (brainstormed 2026-06-02)
**Depends on:** Sub-project B (`research_aiq` AIQ agentic orchestration tier). This slice extends B's eval; it assumes B's `research_aiq` package is present.

## Goal

Turn `research_aiq`'s thin 3-scope eval into a trustworthy, AIQ-native **measurement foundation**: a richer hand-curated dataset graded on robust metrics, plus AIQ's built-in profiler enriched with a few derived headline cost/latency numbers, producing a committed, reproducible **scorecard**. This is the first slice of sub-project C (which later adds the optimizer and a durable observability backend).

## Context

`research_aiq` already ships an AIQ-native eval:
- `research_aiq/research_aiq/eval/dataset.json` — 3 scopes, each `{id, question, answer}` where `question` is a scope JSON string (the workflow input) and `answer` is the mechanical program-set gold from `research_core.completeness.expected_programs_for_scope`.
- `research_aiq/research_aiq/evaluators.py` — three `@register_evaluator`s: `determination_accuracy`, `grounding_faithfulness`, `expected_program_recall` (each a `BaseEvaluator.evaluate_item` returning a 0–1 score).
- `research_aiq/research_aiq/configs/eval_config.yml` — references the `orchestrate` workflow; runnable via `nat eval --config_file ... --reps=N`.

Measured so far: `expected_program_recall` and `grounding_faithfulness` ≈ 1.0 and robust; `determination_accuracy` varies (genuine agentic non-determinism, and per-scope dispositions are hand-curated — the soft spot). nat's profiler (`eval.general.profiler`) exists but was not enabled.

## Principles / key decisions (from brainstorming, all confirmed)

1. **Set-gold + grounding focus.** Gold = the expected **program set** per scope (mechanical, trustworthy). The **rigorous** metrics are `expected_program_recall` + `grounding_faithfulness`; `determination_accuracy` is kept but explicitly **directional** (no per-scope disposition curation). Grade on what is robustly measurable; avoid a subjective labeling slog.
2. **Hand-curated diverse dataset (~12 scopes).** Diversity across the families + thresholds the `research_core` registry covers (air, stormwater, hazmat, waste, wastewater, OSHA; just-under / just-over threshold edge cases) — **not** across many jurisdictions (the registry is SCAQMD + CA/federal-centric).
3. **AIQ-native + a thin derived layer.** Enable nat's built-in profiler; add a thin post-processor for a few domain headline metrics. Do not reinvent profiling (YAGNI) — leveraging AIQ's profiler is a reason AIQ was adopted.
4. **Full dataset every run.** No tiering; each `nat eval` runs all ~12 scopes × reps. Cost is documented. The eval stays **offline** (not in the unit gate).
5. **Extend in-place.** Grow the existing `research_aiq` eval; no new package.

## Architecture

Extends the existing `research_aiq` eval. Two halves:
- **(a) Richer dataset + metric re-ranking** — grow `dataset.json`; relabel which evaluators are primary vs directional.
- **(b) Profiler enablement + derived metrics + scorecard report** — turn on nat's profiler; post-process its output into headline numbers and a committed scorecard.

```
nat eval --config_file eval_config.yml --reps=N
   │
   ├─ per scope×rep: run `orchestrate` workflow ─► ATIF determinations + nat profiler report (eval output dir)
   ├─ evaluators score each item: recall + grounding (primary), accuracy (directional)
   └─ nat aggregates per-evaluator across items×reps
            │
            ▼
   eval_report.py  (reads the eval output dir: scores + profiler report + ATIF determinations)
            │
            ▼
   eval/scorecard.md  (+ scorecard.json)   ← committed artifact
```

## Components

### 1. Dataset — `research_aiq/research_aiq/eval/dataset.json` (+ `dataset_notes.md`)
- Grow 3 → ~12 items `{id, question, answer}`. `question` = scope JSON string; `answer` = `expected_programs_for_scope(scope)` (mechanical program-set gold).
- **Coverage matrix** (recorded in `dataset_notes.md`): each of the six families represented at least once; threshold edge cases — `disturbance_acres` just below / just above 1; chemical quantity near HMBP / EPCRA / OSHA-PSM thresholds; `process_discharge` on/off; SIC/NAICS present vs absent (IGP trigger). Each scope's intent + which family/edge it exercises is documented.
- **Invariant:** every scope MUST drive `research_core.plan_research` + `finalize_run` without error, and its gold keys MUST equal `expected_programs_for_scope(scope)` (enforced by a test guard — this caught a real malformed scope in B).

### 2. Evaluators — `research_aiq/research_aiq/evaluators.py`
- Keep the three evaluators. **Re-rank / relabel:** `expected_program_recall` + `grounding_faithfulness` = **primary/rigorous**; `determination_accuracy` = **directional** (docstring + the scorecard label make this explicit). No new evaluators — the always-on invariants already cover no-fabrication.

### 3. Profiler — `research_aiq/research_aiq/configs/eval_config.yml`
- Enable nat's `eval.general.profiler` so each run emits nat's native cost / latency / token report (plus any bottleneck/forecast nat provides). The exact profiler config keys + output location are confirmed against the installed `nvidia-nat` during implementation (verify-first step, like B's integration tasks).

### 4. Derived-metrics report — `research_aiq/research_aiq/eval_report.py` (new, thin) + `eval/scorecard.md`
- Pure functions that read nat's eval output dir (per-evaluator scores + profiler report + ATIF workflow determinations) and compute headline **derived** metrics: cost-per-run, **cost-per-determination**, #researchers spawned/run, Modal researcher latency p50/p95, total $ + wall-time.
  - **Dollar cost** is derived from the profiler's token counts × a small in-repo per-model pricing map (so the figure is explicit and updatable, not pulled from a live API).
  - **Modal researcher latency** is best-effort from the `spawn_researchers` tool/call timings; if the underlying timing isn't captured by the profiler/spans, the scorecard omits it (fail-soft) rather than fabricating.
- Emit a committed `eval/scorecard.md` (human-readable: per-evaluator distributions + the derived headline section + run metadata: model, reps, date, cost) and a machine-readable `scorecard.json` sidecar.
- **Fail-soft:** if the profiler report is absent or partial, the scorecard notes what's missing rather than crashing. (Observability/reporting never blocks; consistent with B's fail-soft observability vs fail-loud core.)

## Data flow

`nat eval` runs `orchestrate` per scope×rep → writes ATIF determinations + the profiler report to nat's eval output dir → the three evaluators score each item → nat aggregates per-evaluator across items×reps → `eval_report.py` post-processes the output dir into `scorecard.md` + `scorecard.json`.

## Testing

- **Unit (no network, in the gate):**
  - `eval_report.py` derived-metric functions over **sample nat-output fixtures** — assert exact derived numbers for a known fixture (cost-per-determination, p50/p95, etc.), including a degraded/partial-profiler fixture that exercises the fail-soft path.
  - The **dataset well-formedness guard** extended to all ~12 scopes: each drives `plan_research` + `finalize_run` clean; gold keys == `expected_programs_for_scope`.
- **Live (offline, manual, NOT in the gate):** one bounded `nat eval` over the full dataset validates the harness end-to-end and produces the committed sample `scorecard.md`. Record the scorecard + the measured cost/time in the commit.
- The production unit gate (`pytest` + `ruff`) stays green; the live eval is explicitly outside it.

## Error handling

- Malformed scopes are caught at **test** time by the dataset guard (not at live-eval time).
- Profiler/report failures are **non-fatal** to determinations; the scorecard degrades and notes missing sections.
- The eval is offline; the full-run cost (≈ dollars and ≈ minutes for 12 × reps, each scope fanning ~10–12 Modal researchers) is documented in the README + the scorecard header.

## Success criteria

A live `nat eval` over the ~12-scope dataset produces a committed `scorecard.md` containing: (1) `expected_program_recall` + `grounding_faithfulness` distributions (primary) across reps, (2) directional `determination_accuracy`, and (3) a derived cost/latency headline section (cost-per-run, cost-per-determination, researchers/run, Modal p50/p95). Recall ≈ grounding ≈ 1.0. Unit tests (derived-metrics + dataset guard) green. The result is reproducible from the committed config + dataset.

## Non-goals (this slice)

- The **optimizer** (later C slice) — no auto-tuning of model / prompt / concurrency.
- The **durable observability backend / dashboards** (later C slice) — beyond run-level Raindrop `record_run`.
- **Per-scope disposition curation** — set-gold only.
- **OTLP span export to Raindrop** — a B follow-up (Raindrop rejects nat's OTLP protobuf).

## Follow-ups (later C slices)

1. **Optimizer** — consume the eval + profiler signals to tune the workflow (model / prompt / concurrency) against scores + cost.
2. **Durable observability backend + dashboards** — persist traces/metrics beyond the local Raindrop Workshop.
3. **(Optional) deterministic-oracle accuracy track** — curated golden evidence per scope so `determination_accuracy` becomes a rigorous metric, if directional proves insufficient.
