# AIQ Agentic Orchestration Tier (Sub-project B) — Design

Date: 2026-06-01
Status: design — approved in brainstorming; pending written-spec review
Build repo: **permitos** worktree; new branch `feat/aiq-orchestration-tier` off `main` (sub-project A / PR #2 is merged, so `research_core` is on `main`)
Owner track: NVIDIA NeMo Agent Toolkit (AIQ) path
Depends on: sub-project A (`research_core` — the deterministic backstop)

## Context

Today the research pipeline is a deterministic TypeScript pipeline: the planner
emits a fixed hypothesis graph, one researcher runs per task, then verify →
repair → synthesize → recall floor. The model never decides the *shape* of a
run. Sub-project B makes orchestration **model-driven** — an agent decides which
of the planner's candidate hypotheses to investigate and spawns researchers —
while keeping the mechanical grounding backstop (verifier + recall floor) that a
naive agent lacks. This realizes the contract from the (TypeScript, unbuilt)
`docs/superpowers/plans/2026-06-01-agentic-orchestration-tier.md`, but on the
**AIQ / Python** side, because expressing the tier as AIQ functions is what
unlocks the eval / profiler / observability that motivated adopting AIQ.

**The governing principle (same as the test reframe):** the deterministic core
(A) is the **backstop**, not the driver. The model proposes; the mechanism
disposes. Determinism lives only where it must — the mechanical guardrails — and
the orchestration path is agentic and non-deterministic.

## Goal

A model-driven agentic orchestration tier, expressed as AIQ functions + a
supervisor agent, that:
1. lets a real model choose the investigation set and spawn researchers (with
   reactive follow-up), bounded by the planner's candidates;
2. keeps the verifier + recall floor (from `research_core`) as an
   **un-bypassable** post-agent backstop;
3. **fails loud** — never silently falls back to a deterministic result;
4. is observable (AIQ spans + Raindrop) and **eval-first** (invariants on every
   run + an offline live-sampling scorecard).

## Decisions (locked in brainstorming)

1. **Realize the existing agentic-orchestration contract on AIQ Python**:
   `spawn_researchers` / `submit_plan`, prune-not-weaken, recall-floor backstop.
2. **Supervisor = AIQ `tool_calling_agent`** whose tools are `spawn_researchers`
   and `submit_plan`. Most AIQ-native — every turn/tool call is a span (gives the
   per-agent eval/profiler/observability that is the reason to use AIQ).
3. **Authority = prune within candidates + reactive follow-up.** The model
   selects which planner-proposed candidates to investigate and may spawn
   follow-ups (e.g. a `needs_review` bundle → a deeper researcher), but it cannot
   invent obligations beyond the registry's candidates. **No discovery** (a
   follow-up sub-project; needs registry-staging).
4. **Execution topology:** supervisor runs **local** (the `nat` workflow);
   researchers run on **Modal** (the existing `worker.py` `research_task.map`
   fan-out); verifier + recall floor run **in-process** (`research_core`).
5. **Fail loud, no silent deterministic fallback** (see §Fail-loud).
6. **Eval = live + sampling** (offline scorecard) + **always-on invariants** (see
   §Eval).
7. **Observability via Raindrop + AIQ OTel** (see §Observability).
8. **Backstop = `research_core`** (sub-project A), post-agent, un-bypassable.

## Architecture & data flow (one run)

```
scope_pack
  → plan_candidates            (AIQ fn; research_core.plan_research → candidate hypotheses + tasks; deterministic)
  → supervisor                 (AIQ tool_calling_agent over the candidate summary)
        ├─ spawn_researchers(ids)   (AIQ fn; fans the chosen hypotheses to Modal researchers;
        │                            returns DISTILLED conclusions to the model, callable repeatedly —
        │                            but RETAINS the full EvidenceBundles run-side for finalize)
        └─ submit_plan(rationale)   (terminal)
  → finalize                   (AIQ fn = research_core backstop, post-agent, UN-BYPASSABLE:
                                verify_evidence → bounded repair (live re-run on Modal) →
                                synthesize → recall floor (verify_determination_set) over the PRUNED plan)
  → { determinations, status, trace }   (every step is an AIQ span; exported to Raindrop)
```

The supervisor can prune; the recall floor in `finalize` re-derives the
registry-expected program set for the scope and flags anything the model skipped
as `needs_review`. The model cannot weaken grounding: `finalize` is a separate
function *after* the agent, not an agent tool.

## AIQ components (`workflow.yml`)

- `functions:`
  - `plan_candidates` — `@register_function` wrapping `research_core.plan_research(scope)`.
  - `spawn_researchers` — `@register_function`; given hypothesis ids, dispatches
    the corresponding tasks to the Modal researcher endpoint (reusing
    `worker.py` / `MODAL_RESEARCH_ENDPOINT`), runs `run_research_agent` per
    hypothesis. It **accumulates the full `EvidenceBundle`s run-side** (keyed by
    hypothesis, deduped across repeated calls) so `finalize` can verify/synthesize
    them, and **returns only a distilled conclusion + grounding flag to the
    supervisor** (the model reasons on summaries, not raw evidence). The gathered
    bundles + the investigated id set are what flow to `finalize`.
  - `finalize` — `@register_function` wrapping `research_core.finalize_run`
    (verify/repair/synthesize/recall-floor) over the pruned plan + gathered
    evidence.
- `llms:` `openai` (`OpenAIModelConfig`, `_type: openai`; model from env, e.g.
  `OPENAI_ORCHESTRATION_MODEL`).
- `workflow:` a **sequential** composition `plan_candidates → supervisor → finalize`
  (AIQ `sequential_executor` or a thin top-level function). The `supervisor` is
  the `tool_calling_agent` (tools: `spawn_researchers`, `submit_plan`;
  instructions = the orchestration task frame, ported from
  `ORCHESTRATION_AGENT_INSTRUCTION`).

## The backstop (`research_core`, un-bypassable)

`finalize` imports `verify_evidence`, `repair_evidence`, `synthesize`,
`verify_determination_set` from `research_core` (sub-project A). It runs **after**
the agent and is **not** an agent tool — the model cannot talk its way past it.
This is where A's deterministic-guardrail unit tests keep their exact assertions.
Repair, when a bundle fails grounding, is a bounded live re-run on Modal
(quote-constrained), mirroring the existing `repairBundle` live path.

## Fail-loud (no silent deterministic fallback)

The live agentic path never substitutes a deterministic result to mask a broken
agent:
- **Missing `OPENAI_API_KEY`** → error: "agentic orchestration requires
  `OPENAI_API_KEY`." The run fails clearly; it does **not** run the deterministic
  pipeline.
- **Supervisor/agent error or budget exhausted** → the run errors with the cause
  surfaced; no deterministic substitution.
- **Modal/researcher failure:** surfaced explicitly — a *partial* failure marks
  the affected hypotheses errored and the recall floor renders them `needs_review`
  with an explicit error event (honest fail-closed); a *total* fan-out failure
  hard-errors the run. No silent swap to cached fixtures.
- **Verifier + recall floor always run** on whatever evidence was actually
  gathered — but they never fabricate a result when the agent could not run.
- **Fixture mode** (`RESEARCH_MODE=fixture`) remains a **separate, explicit**
  demo/offline mode — chosen deliberately, never an automatic error-mask.

This is a deliberate divergence from the old TS plan (which fell back to
deterministic — that was demo-oriented).

## Eval (live + sampling) + invariants — two layers

**Layer 1 — always-on invariants** (deterministic checks on *every* run's output;
cheap; CI-able; unit-tested against a recorded run):
- No determination with `verified: true` lacks a passing verifier verdict AND a
  verbatim quote present in its fetched source.
- The recall floor ran and flagged every expected-but-uninvestigated program as
  `needs_review` (no silent drop).
- Fail-closed: missing facts → `needs_review`, never a confident yes/no.

**Layer 2 — offline live-sampling scorecard** (token-costly; run deliberately,
*not* the CI gate; the AIQ eval use case):
- Dataset: the three seeded scopes (complex, construction, missing_facts) with
  **stable gold labels** — per-program `applies` / `needs_review` (not exact
  quotes, which vary live).
- Run the workflow **live, N samples per scope** (N tunable; default ~5).
- Evaluators (AIQ eval evaluators): determination accuracy vs gold (distribution:
  mean/min/max), quote-grounding faithfulness (% verified rows whose quote is
  verbatim in source), expected-program recall (every expected program surfaced),
  cost/latency (from the profiler).
- Output: a scorecard with distributions across N×3 runs.

## Observability & eval-creation (Raindrop + AIQ)

- **AIQ → OpenTelemetry → Raindrop:** AIQ emits OTel spans for every supervisor
  turn, tool call (`spawn_researchers`), researcher run, and `finalize` step.
  Export that span stream to Raindrop (configured under `workflow.yml`
  `general.telemetry`) for full agentic-run trace debugging + replay, alongside
  AIQ's own profiler.
- **Run-level Raindrop interaction:** mirror the existing `run.ts` usage — begin/
  finish an interaction per run recording run metrics (candidate count,
  investigated count, determination count, `needs_review` count, repair count,
  cost/latency) + verifier/LLM-judge annotations.
- **Eval-creation:** curate gold/eval cases for Layer 2 from Raindrop-captured
  real runs.
- *Confirm in the implementation plan:* the exact Python hookup — AIQ's OTLP
  exporter pointed at Raindrop's collector if Raindrop ingests OTLP, otherwise a
  Raindrop Python SDK / HTTP wrapper.

## File structure

A new package `research_aiq/` (uv-managed, Python ≥ 3.11; depends on
`nvidia-nat` + `research_core`):

```
research_aiq/
  pyproject.toml                 # deps: nvidia-nat[...], research_core; dev: pytest, ruff
  research_aiq/
    __init__.py
    functions/
      plan_candidates.py         # @register_function → research_core.plan_research
      spawn_researchers.py       # @register_function → Modal researcher fan-out
      finalize.py                # @register_function → research_core.finalize_run (backstop)
    supervisor.py                # tool_calling_agent config + orchestration task-frame prompt
    invariants.py                # the always-on output checks (Layer 1)
    observability.py             # Raindrop interaction wrapper + OTel/telemetry wiring
    workflow.yml                 # functions / llms / workflow (+ telemetry → Raindrop)
  eval/
    dataset.json                 # 3 gold scopes + stable labels
    evaluators.py                # accuracy / grounding / recall / cost evaluators
    run_eval.py                  # live N-sample harness → scorecard
  tests/
    test_invariants.py           # invariants on a recorded run
    test_spawn_researchers.py    # fan-out fn with a fake Modal client
    test_finalize.py             # backstop fn over fixture evidence (reuses research_core)
    test_supervisor.py           # agent loop with a scripted llm + fake spawn (prune/dedupe/budget)
```

Reuses Modal `worker.py` for the researcher fan-out (no new researcher logic).

## Testing philosophy (eval-first; consistent with the A reframe)

- **Production gate (CI):** the Layer-1 invariant tests + `research_aiq` unit
  tests (supervisor loop with fakes, fan-out, finalize over fixtures) + A's
  guardrail units. Deterministic, fast.
- **Offline:** the Layer-2 live-sampling scorecard (`run_eval.py` / `nat eval`).
- **No golden byte-parity on the agentic path** — the model-driven path is
  non-deterministic by design and is scored, never exact-matched.

## Non-goals / boundaries

- No **discovery** (model inventing programs beyond planner candidates) — needs
  registry staging; a follow-up.
- No **Node thin-client cutover** (sub-project D) — B exposes the AIQ workflow;
  wiring the Next app to trigger it + render from Supabase is D.
- No **full profiler dashboards / observability backend / optimizer** — **C**
  expands eval into the profiler + observability export + optimizer + a richer
  dataset. B ships the runtime + invariants + a live-sampling **scorecard**.
- No removal of the deterministic path — it remains the explicit fixture/demo
  mode and the in-process backstop (not a silent fallback).

## Risks & mitigations

- **Agent prunes a real obligation** → recall floor flags it `needs_review`
  (backstop); Layer-1 recall invariant + Layer-2 recall metric guard it.
- **Live eval flakiness / cost** → kept offline + sampled (distributions), never
  the CI gate; invariants carry CI.
- **Modal latency/failure in eval** → fail-loud (explicit error / `needs_review`),
  surfaced in the scorecard, not hidden.
- **Raindrop Python integration unknown** → flagged confirm-in-plan; AIQ OTel
  export is the primary path, run-level wrapper the fallback.
- **AIQ `sequential_executor` vs custom top-level fn** → pick whichever cleanly
  threads candidates → supervisor → finalize; decide in the plan against the AIQ
  control-flow examples.

## Resolved decisions (from review)

1. **Raindrop integration:** install the Raindrop tooling via
   `curl -fsSL https://raindrop.sh/install | bash`; wire AIQ's telemetry export +
   the run-level interaction through whatever it exposes (CLI / SDK / OTLP
   collector). The first step of the Raindrop task in the plan verifies the
   installed surface and chooses the exact hookup.
2. **Modal researchers:** reuse the existing `worker.py` / `MODAL_RESEARCH_ENDPOINT`
   fan-out from `spawn_researchers` — no new researcher logic.
3. **Eval sampling + gold:** N ≈ 5 samples per scope (tunable); gold labels are
   per-program `applies` / `needs_review` for the three seeded scopes (stable
   fields, not exact quotes).
4. **Top-level composition:** AIQ `sequential_executor`
   (`plan_candidates → supervisor → finalize`).
5. **Branch base:** sub-project A (PR #2) is **merged to `main`**, so B is built on
   a new branch `feat/aiq-orchestration-tier` off `main` (`research_core` is on
   `main`).
