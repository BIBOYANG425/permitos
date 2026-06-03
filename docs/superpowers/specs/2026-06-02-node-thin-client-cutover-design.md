# Node Thin-Client Cutover (Sub-project D) — Design

**Status:** Design (brainstormed 2026-06-02)
**Depends on:** Sub-projects A (`research_core`), B (`research_aiq` orchestrate), C (eval/observability) — all merged to `main`.

## Goal

Make the Python stack the single source of truth for permit-applicability research. The Node app's intake produces a scope, calls a **deployed `research_aiq` orchestrate endpoint**, and renders the returned determinations; the duplicate TypeScript research pipeline is **retired**. One sub-project, two phases: (1) deploy the orchestrate endpoint, (2) cut the Node app over and delete the TS pipeline.

## Context

Today the Node app (`src/lib/research/`) runs the **full TS research pipeline** — planner, agentic loop, verifier, synthesis — with researchers running in-Node (`live`) or fanned out to the deployed Modal worker (`modal`), selected by `researchMode.ts` (`live`/`modal`/`fixtures`, with a silent fixture fallback on failure). The Python stack is a parallel implementation: `research_core` is a 1:1 port of that TS pipeline, and `research_aiq` adds the agentic `orchestrate` workflow (`plan_candidates → supervisor → spawn_researchers → finalize`). `research_aiq` runs **locally only** (the `nat` CLI); the **only deployed Python is the researcher `worker.py`** on Modal (endpoints `research`, `start_run`). So a cutover requires first deploying `research_aiq`'s orchestrate as a reachable HTTP service.

## Principles / decisions (from brainstorming, all confirmed)

1. **Full replacement.** Retire the TS research pipeline (planner/verifier/synthesis/workers/modes); research has one path — call the Python orchestrate. (The Modal `worker.py` stays — `research_aiq`'s `spawn_researchers` still uses it.)
2. **Deploy via a Modal endpoint wrapping orchestrate** (sibling to `worker.py`), scale-to-zero, token-authed, Vercel-reachable.
3. **Node keeps intake; the endpoint takes a scope.** The existing Node scope-extraction stays (front door + UI); only the research backend is swapped. The endpoint contract is `{token, scope} → ResearchRun` — Node still extracts the scope, and the backend takes `{token, scope}` and returns the full `ResearchRun` (not just determinations).
4. **Fail-loud.** Endpoint unreachable/errors → the Node app surfaces a clear error, not the old silent fixture fallback (consistent with the project's fail-loud core).
5. **Two-phase plan:** deploy the endpoint first (Phase 1), then cut over + retire (Phase 2).

## Architecture (after D)

```
Node intake (scope extraction, unchanged) ─► scope JSON
   └─ POST {token, scope} ─► [Modal] research_aiq orchestrate endpoint
        plan_candidates → supervisor → spawn_researchers ─► [Modal] worker.py (unchanged)
        → finalize (verify → repair → synthesize → recall floor)
        → full ResearchRun (run_id, status, determinations, research_graph,
          evidence_bundles, verification_verdicts, trace_events, report_markdown, …)
   ◄─ ResearchRun ────────────┘
Node renders the determinations (existing UI)
```

## Components

### Phase 1 — `src/lib/research/modal/orchestrator.py` (new Modal app)
- A Modal app (sibling to `worker.py`). Image bundles `research_aiq` + `research_core` + `nvidia-nat` (+ its deps); attaches `modal.Secret`s for OpenAI, the research token, and Supabase. It reuses the existing worker for researchers via `MODAL_RESEARCH_ENDPOINT` (set in the orchestrator's env/secret).
- `@modal.fastapi_endpoint(method="POST")` `orchestrate`: validates a body token (mirroring `worker.py`'s auth), reads `{scope}`, runs the `research_aiq` `orchestrate` workflow programmatically via nat's Python API (load `research_aiq/configs/workflow.yml`, build + invoke the workflow on the scope JSON string), and returns the **full `ResearchRun`** — `research_core.finalize_run`'s output (determinations + `research_graph` + `evidence_bundles` + `verification_verdicts` + `trace_events` + `report_markdown` + coverage families / angles / tasks / …). `research_aiq`'s `finalize` was widened (un-trimmed from `{run_id, determinations, status}`) so the endpoint feeds the Node renderer unchanged. On missing token → 401; on missing OpenAI key / unreachable worker / pipeline error → a fail-loud error response (no fabricated determinations).
- **Observability (free):** the deployed orchestrate epilogue runs `persist_run` → **Supabase** (reachable from Modal, via the Supabase secret) and `record_run` → Raindrop (localhost unreachable from Modal → fail-soft no-op). So production runs populate the observability backend automatically.

### Phase 2 — Node thin client + TS-pipeline retirement
- **New thin client** (e.g. `src/lib/research/orchestrateClient.ts`): `runResearch(scope) → ResearchRun` — POSTs `{token, scope}` to `MODAL_ORCHESTRATE_ENDPOINT`, validates + returns the parsed `ResearchRun` (adding the two TS-only fields `project_facts` / `jurisdiction_stack` derived from the scope); throws a clear error on non-2xx / unreachable / malformed response (fail-loud). A shared `assertConfigured()` lets the route fail fast before intake when env is missing.
- **Rewire the research entry** (`src/lib/research/run.ts` / the `/api/research/run` route): call `orchestrateClient.runResearch(scope)` instead of the in-Node TS pipeline.
- **Retire** the now-dead TS research modules: the TS planner, verifier, synthesis, `liveResearchAgent`, `liveWorker`, `workers.ts`/`modal/researchPool.ts` fanout, and the `live`/`modal`/`fixtures` mode machinery (`researchMode.ts`). Keep intake (`@/lib/intake`, `scope.ts`) and the determinations renderer.
- **Determinations shape:** `research_core` is the 1:1 port of the retired TS pipeline, so the returned determinations should match what the Node UI renders; add a thin adapter only for any field the implementation finds differs (verified against the renderer in the plan).
- **Env:** add `MODAL_ORCHESTRATE_ENDPOINT` (+ the research token) to the Node app's env (`.env.local` + Vercel).

## Error handling

Fail-loud end to end: a missing/unreachable endpoint, a non-2xx response, or a missing token surfaces a clear "research unavailable" error to the Node caller (and the user) — the old silent fixture fallback is removed so failures are visible. The deployed endpoint itself is fail-loud (no key / no worker → error, never fabricated determinations). Observability (`persist_run`/`record_run`) remains fail-soft and never blocks a run.

## Testing

- **Phase 1:** a live smoke — `POST {token, scope}` to the deployed endpoint → a determinations payload with a `status`; a fail-loud check — no/invalid token → error, no determinations. Confirm a `research_runs` row lands in Supabase from the deployed run.
- **Phase 2:** unit-test `orchestrateClient` against a mocked fetch (success → parsed determinations; non-2xx/unreachable → throws). An E2E smoke: intake → endpoint → render against the deployed endpoint. The TS-pipeline deletion is verified by the app type-checking/building (`tsc`/`next build`) and the existing Node test suite (`vitest`) passing after the dead modules are removed.
- Keep the change green: `pnpm typecheck` + `pnpm test` (Node) must pass after retirement.

## Success criteria

- The orchestrate Modal endpoint is deployed and returns determinations for a scope (token-authed, fail-loud), with a `research_runs` row appearing in Supabase.
- The Node app's research path calls the endpoint (no TS pipeline); intake + rendering still work end to end.
- The TS research pipeline modules are deleted; `pnpm typecheck` + `pnpm test` + `next build` pass.
- `orchestrateClient` unit tests (success + fail-loud) pass.

## Non-goals (this sub-project)

- Moving intake/scope-extraction to Python (stays in Node).
- Any new UI (the existing determinations renderer is reused).
- Changing the Modal researcher `worker.py`.
- Discovery / registry-staging; a custom observability dashboard (C follow-up).
- Removing the fixture path entirely as a dev-only escape hatch (it just stops being a silent production fallback).

## Follow-ups (later)

1. Retire the Modal worker in favor of an in-orchestrator researcher pool (if desired) — currently the worker stays.
2. Move intake to Python for a fully thin Node client.
3. A custom Next.js dashboard over the Supabase observability tables (C follow-up).
