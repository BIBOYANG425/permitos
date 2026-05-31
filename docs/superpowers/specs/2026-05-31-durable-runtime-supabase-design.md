# Durable research runtime (Supabase + Modal spawn + poll/Realtime)

**Date:** 2026-05-31
**Status:** Approved design (Supabase project provisioned: `gcfhexotjfmowlbzcggd`), ready for plan
**Base:** `feat/modal-endpoint` (PR #12) — extends the Modal HTTP endpoint + OpenAI reasoning worker
**Engine decision (locked):** keep the OpenAI reasoning worker on Modal. No Claude Agent SDK / Vercel Sandbox.

## Goal

A real multi-agent research run takes minutes (all-reasoning workers). The current synchronous
`POST /api/research/run` holds the Vercel function open and is capped at 60s. Make runs **durable**:
the long fan-out runs detached on Modal and writes incremental state to Supabase; the API returns a
`run_id` immediately and the UI reads progress (poll + Supabase Realtime push). **Opt-in** via
`RESEARCH_RUNTIME=durable`; the synchronous path stays the default so the demo never breaks.

Key insight that keeps this small: only the **fan-out** is slow. `parseScope` (~seconds),
`planResearch`, `verify`, `repair`, and `synthesize` are fast/pure and stay in **TypeScript** — no
Python pipeline port. Modal owns durability; Node finalizes on poll.

## Architecture

```
POST /api/research/run            (durable mode)
  planRun(input): parseScope + planResearch            [fast, TS]
  → store.createRun(run_id, queued, scope_pack, plan, task_count, trace)   [Supabase insert]
  → POST Modal /start_run {run_id, task_specs, token}                       [HTTP]
  → return { run_id, status: "queued" }                                     [immediate]

Modal /start_run  (@fastapi_endpoint): validate token → research_run.spawn(run_id, task_specs)
  research_run (Modal fn): research_task.map(task_specs); for each EvidenceBundle
     → Supabase upsert research_evidence(run_id, hypothesis_id, bundle)
     → update research_runs.status (running → bundles_complete)

GET /api/research/run/:id
  read research_runs + research_evidence
  if status != done and evidence_count >= task_count:
     finalizeRun(scope_pack, plan, bundles): verify(+repair) + synthesize   [fast, TS]
     → store.finalizeRun(determinations, report, trace, status=done)
  return full ResearchRun (done) | partial { run_id, status, bundles_count, task_count, trace }

UI (durable mode): subscribe Supabase Realtime on research_evidence/research_runs(run_id)
  → on change, re-fetch GET /:id and feed the store (poll-on-push). [minimal — see Out of Scope]
```

## Components

### Supabase schema (migration SQL, applied by operator / via Supabase MCP once authed)
- **`research_runs`**: `run_id text primary key`, `status text` (`queued|running|bundles_complete|done|failed`),
  `input jsonb`, `scope_pack jsonb`, `plan jsonb`, `jurisdiction_stack jsonb`, `task_count int`,
  `determinations jsonb` (null until finalized), `report_markdown text`, `trace_events jsonb`,
  `created_at timestamptz default now()`, `updated_at timestamptz`.
- **`research_evidence`**: `run_id text references research_runs(run_id)`, `hypothesis_id text`,
  `bundle jsonb`, `created_at timestamptz default now()`, `primary key (run_id, hypothesis_id)`
  (upsert-safe: a re-run of a task overwrites its row).
- **RLS:** enabled. A permissive **read-only** `select` policy for the `anon` role on both tables (so the
  UI can subscribe via Realtime with the public anon key). All writes use the **service key**, which
  bypasses RLS (server-only: Node API + the Modal worker). Realtime publication enabled for both tables.

### Node: `src/lib/research/store/supabaseStore.ts` (new)
Thin typed store with an injectable client seam (`__setClientForTests`) so logic is unit-tested without
a live Supabase. Functions: `createRun(record)`, `getRun(run_id)`, `listEvidence(run_id)`,
`finalizeRun(run_id, {determinations, report_markdown, trace_events})`, `updateStatus(run_id, status)`.
Uses `@supabase/supabase-js` (new dep) with `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. If env is unset,
`isStoreConfigured()` returns false → callers fall back to the synchronous path.

### Node: `run.ts` refactor (split the existing pipeline; no behavior change to sync mode)
Extract two pure-ish functions from today's `runResearch` so both modes share them:
- `planRun(input): { run_id, scope_pack, plan, trace_events }` — `createRunId` + `parseScope` + `planResearch` + initial trace.
- `finalizeRun(run_id, scope_pack, plan, initialEvidence, baseTrace): ResearchRun` — the verify→repair loop + `synthesize` + status (today's run.ts lines ~56-145, including the raindrop/LLM-judge calls).
- `runResearch(input)` (synchronous, unchanged contract) = `planRun` → `runLocalResearchPool` → `finalizeRun`.

### Node: API routes
- `app/api/research/run/route.ts` (modify): durable branch when `RESEARCH_RUNTIME==="durable" && isStoreConfigured()` → `planRun` → `store.createRun(queued)` → POST Modal `start_run` → return `{run_id, status:"queued"}`. Else the current synchronous behavior (returns full `ResearchRun`). `maxDuration` stays 60.
- `app/api/research/run/[id]/route.ts` (new): GET → `store.getRun` + `store.listEvidence`. If not finalized and `evidence.length >= task_count` → `finalizeRun` → `store.finalizeRun` → return full `ResearchRun`. Else partial. 404 on unknown id.

### Modal: `worker.py` (extend) + `worker_core.py` (pure helper)
- `start_run` `@modal.fastapi_endpoint(method="POST")`: validate token → `research_run.spawn(run_id, task_specs)` → `{status:"queued", run_id}`.
- `research_run(run_id, task_specs)` `@app.function` (secrets: `permitpilot-openai`, `permitpilot-research`, `permitpilot-supabase`): `for result in research_task.map(task_specs)` → `_write_bundle(run_id, result)` (Supabase upsert via the `supabase` python client) → final `updateStatus(bundles_complete)`. Fail-soft per task (a worker error still writes a `failed_bundle` row).
- `worker_core.evidence_row(run_id, bundle) -> dict` — pure mapping `EvidenceBundle → research_evidence` row; unit-tested.
- Image gains `supabase` pip dep.

### UI: minimal durable consumer (scoped)
A `useDurableRun(run_id)` hook (durable mode only): subscribe to Supabase Realtime
(`research_evidence`/`research_runs` filtered by `run_id`) using the public anon key; on any change,
re-fetch `GET /:id` and push the returned `ResearchRun` into the existing store. Falls back to a ~3s
poll if Realtime is unavailable.

## Error handling
- `RESEARCH_RUNTIME` unset OR Supabase env unset → synchronous path (today's behavior), no durable code runs.
- Modal `start_run` POST fails → the run row is marked `failed` and the POST returns a clear error (the
  client can retry in synchronous mode); no silent hang.
- A worker task error inside `research_run` → a `failed_bundle` row (`needs_review`), not a crash — the
  run still finalizes.
- Bundles never reaching `task_count` (a worker died) → `GET /:id` keeps returning `running`; a
  `created_at` age check surfaces a `stalled` status after a generous window (no auto-fabrication).
- Unknown `run_id` → 404.

## Operator provisioning (you)
1. Authenticate the Supabase MCP: `claude /mcp` → supabase → Authenticate (interactive terminal).
2. Apply the migration (via the Supabase MCP `apply_migration`, or paste the SQL in the dashboard).
3. Set env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (Node server-only), `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (UI), `RESEARCH_RUNTIME=durable`. Create Modal secret
   `permitpilot-supabase` with `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. Redeploy Modal (`modal deploy`)
   and Vercel.

## Testing
- `supabaseStore.ts`: injected fake client → create/get/list/finalize/updateStatus round-trip; `isStoreConfigured` env gating.
- Durable route logic: factored so it is testable with a fake store + fake Modal-start fn — POST durable
  creates a queued run and returns `run_id`; GET incomplete → partial; GET complete → runs `finalizeRun`
  and returns `done` with determinations.
- `run.ts` split: existing synchronous tests stay green (same `runResearch` contract); a new test asserts
  `planRun` + `finalizeRun` compose to the same result as `runResearch` for a fixture run.
- `worker_core.evidence_row` pure test; existing `worker_core` tests stay green.
- Synchronous path + all prior tests remain green.

## Out of Scope
- The deep `useReplay`/`selectors` incremental-streaming rewrite (autoplan Finding 5 / Phase 8). We ship
  the Realtime data path + a minimal poll-on-push consumer; per-tile live animation may stay coarse.
- Multi-user auth / run history UI; per-task `modal.Sandbox` isolation; migrating off the synchronous
  path as default.
- Sub-project A (skills library) — separate spec/plan, sequenced after.

## Success Criteria
1. With `RESEARCH_RUNTIME=durable` + Supabase configured, `POST` returns a `run_id` in <2s; the fan-out
   runs detached on Modal; `GET /:id` shows bundles arriving and finalizes to a complete `ResearchRun`.
2. With durable mode off (or Supabase unset), behavior is byte-for-byte today's synchronous path.
3. All logic unit-tested with an injected fake Supabase client; `pnpm test`/`typecheck`/`build` green;
   `worker_core` python tests green.
