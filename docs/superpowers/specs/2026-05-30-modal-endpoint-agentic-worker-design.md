# Deployed Modal endpoint + catalog-governed agentic worker

**Date:** 2026-05-30
**Status:** Approved design, ready for implementation plan
**Base:** `main` (independent of PR #11 / dynamic planner — touches the worker/transport, not planner fact logic)

## Goal

Two coupled changes so the real research path works in production and the tool/skill
model is actually enforced at runtime:

1. **Reachable from Vercel** — replace the `modal run` CLI subprocess (localhost-only)
   with a deployed Modal **HTTP web endpoint** that Node `fetch()`es from both
   localhost and Vercel serverless. One code path; "what you test is what runs in prod."
2. **Real tools and skills** — the sandbox worker becomes a **hybrid agentic researcher
   with guardrails**: an LLM agent that chooses which catalogued tools to call, where
   the harness hard-enforces tool scope, budget caps, the grounding guard, and a
   deterministic fallback. The TypeScript tool catalog / skill registry govern the
   worker's runtime tool set (today they are inert metadata).

## Approved Decisions

1. **Transport: HTTP endpoint everywhere.** No CLI path retained. A real run (local or
   prod) requires `modal deploy` first.
2. **Tool-use depth: hybrid agentic with guardrails.** LLM picks tools; harness refuses
   `blocked_tools`, enforces the budget, keeps the grounding guard, and falls back to the
   deterministic `fetch → extract` sequence on budget exhaustion.
3. **Fallback when Modal unreachable: fixtures + visible degraded trace.** The run
   completes on fixtures and emits a `⚠ research_pool degraded` trace event. Individual
   per-task failures remain per-task `needs_review`, not a global fixture swap.
4. **Model:** OpenAI `gpt-4o-mini` (`OPENAI_INTAKE_MODEL` override), key from the Modal
   secret inside the sandbox (unchanged).

## Architecture

```
Vercel / localhost (Node)              Modal cloud (Python; one container per request = sandbox)
─────────────────────────              ────────────────────────────────────────────────────────
run.ts                                  @app.function + @fastapi_endpoint  POST /research
  → researchPool.ts                      1. validate bearer token (else 401)
      per task:                          2. expose tools = task_spec.allowed_tools ∩ implemented
        POST endpoint {token, spec} ──▶  3. AGENTIC LOOP (LLM picks tools; harness-guarded)
      Promise.allSettled fan-out         4. return EvidenceBundle JSON
  ◀── EvidenceBundle JSON
  endpoint env unset / pre-flight fails
      → fixture pool + ⚠ degraded trace
```

Each HTTP request provisions its own Modal container, preserving "one sandbox per
research task." The fan-out and per-task isolation are unchanged.

## Components

### `worker.py` (Modal app — deployed)
- `modal deploy src/lib/research/modal/worker.py` publishes the app with a stable web
  endpoint via `@modal.fastapi_endpoint(method="POST")` wrapping the researcher.
- **Auth:** the endpoint reads `RESEARCH_TOKEN` from the Modal secret and compares it to
  the request's bearer token; mismatch → HTTP 401. Token value never appears in code.
- **Request body:** `{ "token": str, "task_spec": { hypothesis_id, question,
  allowed_tools: string[], blocked_tools: string[], budget: {max_sources, max_model_calls} } }`.
- **Response:** the existing `EvidenceBundle` JSON shape (so the bridge parse is unchanged
  apart from reading the HTTP body instead of grepping stdout).
- Keeps `@app.local_entrypoint` for manual `modal run` debugging, but the production /
  app path no longer depends on it.

### Agentic researcher (`worker.py` + `worker_core.py`)
- Loads the `research` skill definition (its `trigger`/`doneCondition`/`title` build the
  agent system prompt). The skill's `allowedToolIds` are sourced from `task_spec.allowed_tools`
  (sent by the TS planner — the source of truth), so the catalog governs across the
  language boundary with no Python-side duplication of scope.
- Implements these catalogued tools as real OpenAI function-tools, **exposing only those
  present in `allowed_tools`**:

  | Catalog id | Implementation |
  |---|---|
  | `get_source_pointers` | return allowlisted URL + authority rank for the hypothesis |
  | `get_triggers` | return the program's threshold/predicate hints |
  | `fetch_source(url)` | httpx fetch (allowlisted hosts only) + pymupdf/bs4 parse + sha256; embeds the allowlist + `quarantine_injection` guard |
  | `prove_currency(text)` | classify current / stale / unconfirmed from dates |
  | `evaluate_predicate(facts)` | evaluate the trigger predicate against attributes |
  | `submit_finding(...)` | **terminal** — this *is* `extract_threshold`; ends the loop, harness runs the grounding guard, builds the bundle |

- **Guardrails (harness-enforced around the LLM's choices):**
  1. *Scope:* a tool id not in `allowed_tools`, or any id in `blocked_tools`, is hard-refused
     with an error returned to the model + a `scope_violation` trace event. (They are also
     simply absent from the tools array — defense-in-depth.)
  2. *Budget:* `budget.max_model_calls` caps loop iterations; `max_sources` caps
     `fetch_source` calls.
  3. *Grounding guard:* `submit_finding.verbatim_quote` must appear in the fetched text
     (whitespace-tolerant) or it is blanked → `needs_review`. Unchanged guarantee.
  4. *Termination fallback:* budget exhausted without a `submit_finding` → run the
     deterministic `fetch → extract` sequence (today's pipeline) so every task returns a bundle.
  5. Each tool call emits a trace event (the universal `log_step`/`emit_trace_event`,
     auto-emitted by the dispatcher — the agent does not call them explicitly).

### `planner.ts`
- `taskForHypothesis` raises the researcher `budget.max_model_calls` from **2 → 4** to give
  the agentic loop room (get_source_pointers/fetch → prove_currency → submit). Only that
  field changes; `allowed_tools`/`blocked_tools` stamping is already present.

### `researchPool.ts` (new; replaces `modal/runModalPool.ts` CLI internals)
- `runModalResearchPool(tasks, hypotheses)` swaps `spawn("modal", …)` for
  `fetch(MODAL_RESEARCH_ENDPOINT, { method: POST, body: {token, task_spec} })`, keeping the
  `Promise.allSettled` fan-out and per-task `failedBundle` on individual errors.
- A `__setFetchForTests(fn|null)` seam mirrors the existing `__setSpawnForTests` pattern so
  unit tests inject a fake `fetch` (the project's vitest config can't `vi.mock` node imports).
- **Degraded detection** (no separate health-ping; avoids extra latency) — returns a result
  object `{ bundles, degraded?: { reason } }`:
  - `MODAL_RESEARCH_ENDPOINT` or `MODAL_RESEARCH_TOKEN` unset → degraded immediately, **no
    requests issued**, reason `"Modal endpoint not configured"`.
  - env present → fan out. If **every** task failed with a *transport-level* error (network
    refused / timeout / HTTP 401 / HTTP 5xx — i.e. the endpoint itself is down, not a parsed
    per-task `needs_review`) → degraded, reason `"Modal endpoint unreachable"`.
  - env present and **at least one** task returned a bundle → not degraded; any individual
    failures stay per-task `failedBundle` (`needs_review`).
  In every degraded case the returned `bundles` are the **fixture pool's** bundles.

### `workers.ts` + `run.ts`
- `workers.ts` `USE_MODAL` branch calls `researchPool.ts`; if it reports degraded, it uses
  `runLocalResearchPool`'s fixture bundles and surfaces the reason.
- `run.ts` emits one trace event on degraded:
  `trace(run_id, "research_pool", "fanout", "needs_review", "⚠ Modal unreachable — using cached fixtures")`.

## Data flow

`runResearch` → `planResearch` (stamps allowed/blocked tools + budget per task) →
`researchPool` (per task: POST to endpoint) → Modal container runs the agentic researcher
(LLM ↔ scoped tools, guarded) → `EvidenceBundle` → verifier → synthesis. On unreachable
endpoint: fixtures + degraded trace.

## Error handling

- 401 (bad/missing token) → bridge treats the pool as unreachable → degraded fixtures.
- Per-task fetch/parse/LLM/network/timeout error inside the sandbox → `failed_bundle`
  (`needs_review`) for that task only.
- Missing `MODAL_RESEARCH_ENDPOINT`/`MODAL_RESEARCH_TOKEN` → degraded fixtures + trace.
- The scope guard refusing a blocked tool is **not** a run failure — it is fed back to the
  model and logged; the loop continues.
- Never throws out of `runResearch`.

## Config & deployment (operator runs; the value is never handled in code)

1. `modal deploy src/lib/research/modal/worker.py` → prints the endpoint URL.
2. Create Modal secret `permitpilot-research` with `RESEARCH_TOKEN=<random>` (in addition to
   the existing `permitpilot-openai`).
3. Set Vercel env: `MODAL_RESEARCH_ENDPOINT=<url>`, `MODAL_RESEARCH_TOKEN=<same random>`,
   `USE_MODAL=1`.

## Testing

- **TS unit (`researchPool.test.ts`)** via injected fake `fetch`:
  - happy path → parses the `EvidenceBundle`;
  - per-task HTTP 500 → `failedBundle` for that task, others succeed;
  - missing-env → degraded result carrying fixture bundles + reason.
- **Python unit (`worker_core_test.py`, extended — no Modal needed, pure functions):**
  - scope refusal: a `blocked_tools` id → refusal payload, not execution;
  - allowed-tools filtering: only ids in `allowed_tools` are offered to the model;
  - grounding guard on `submit_finding`: ungrounded quote → blanked → `needs_review`;
  - budget-exhaustion fallback: no `submit_finding` within `max_model_calls` → deterministic
    `fetch → extract` bundle returned.
- **Integration:** keyed `pnpm eval` contract unchanged. The plan documents one manual
  `modal deploy` + a single live `curl` against the endpoint as a smoke check.

## Out of Scope

- Caching fetched sources across runs (`get_cached_source` stays a catalog entry, not wired).
- Streaming partial results to the UI (still one bundle per task at the end).
- Re-implementing the TS catalog in Python (scope is passed in per task instead).
- Durable `Function.spawn` + `modal.Dict` + polling topology (a real multi-agent run can still
  hit the Vercel route timeout — deferred; see the live-agent-sdk autoplan v2).

## Amendments (2026-05-30, post-approval)

Two decisions were taken after the initial approval, reconciling with the approved
`2026-05-30-live-agent-sdk-modal-runtime.md` autoplan (same goal, different engine):

1. **Consume-side generalization is now IN scope (was excluded above).** Confirmed against
   the code: `verifier.ts:106` rubber-stamps any non-special-cased bundle
   (`grounding`/`predicate_math` hardcoded `pass:true`), and `synthesis.ts:73` `appliesFor`
   returns `"yes"` for everything except `H-STORM-CGP`, ignoring `researcher_conclusion`.
   So real worker evidence would be auto-passed / overwritten for non-demo hypotheses — a
   correctness/safety hole in a compliance product. We generalize the **verifier** (real
   grounding: the extracted claim's quote must appear in the cited source quote; predicate
   respects `researcher_conclusion`; grounding-fail → `fail` + repair ticket) and
   **synthesis** (`appliesFor` reads `researcher_conclusion`). The HMBP/CGP special cases
   stay (the fixture demo moment is preserved). `confidence.ts` check-names already align
   with the verifier's emitted names (`currency/authority/grounding/predicate_math`) — no
   change. `repairEvidence`'s generic `needs_review` return is acceptable given the
   generalized verifier now routes correctly.

2. **All-reasoning worker.** The worker uses a reasoning-tier model for BOTH the agentic
   loop and the extraction/judgment (chosen for max quality). Implications baked into the
   plan: model is env-configurable (`OPENAI_RESEARCH_MODEL`, default a reasoning model);
   the OpenAI calls use `max_completion_tokens` (not `max_tokens`), omit a custom
   `temperature` (reasoning models reject it), and use `tool_choice:"required"` rather than
   a forced single-function choice (broader reasoning-model compatibility). Timeouts rise:
   Modal function `timeout` → 600s, Node fetch request timeout → 600s, and the research
   API route `maxDuration` → 800s (Vercel fluid-compute ceiling; clamped on lesser plans).
   Budget caps
   (`max_model_calls`, `max_sources`) remain the latency/cost backstop. NOTE: a long
   all-reasoning run amplifies the deferred Vercel-route-timeout limitation above.

## Success Criteria

1. With the endpoint deployed and Vercel env set, a run on the deployed app produces real
   grounded evidence (not fixtures), proven by a live trace + at least one grounded quote.
2. With the env unset, a run completes on fixtures and shows the `⚠ research_pool degraded`
   trace — no crash, nothing fabricated.
3. The agentic worker only ever calls tools in `allowed_tools`; a forced `blocked_tools`
   attempt is refused + logged (unit-tested).
4. Grounding guard, budget caps, and deterministic fallback all hold (unit-tested).
5. `pnpm typecheck` + `pnpm build` clean; existing tests stay green.
