# Dynamic LLM Planner (real parseScope)

**Date:** 2026-05-30
**Status:** Approved design, ready for implementation plan
**Base:** `feat/real-modal-research` (extends PR #10's "make research real")

## Goal

Replace `parseScope`'s seeded keyword-routing with **LLM fact-extraction** so the `ScopePack` reflects the real project, and loosen `planResearch`'s family triggers so real facts drive a **variable** hypothesis/agent count over the known coverage families. This fixes "the agent count is always fixed": today `parseScope` routes every description to one of three seeded scopes, so `planResearch` (which is already fact-driven) always sees the same fact-sets.

## Approved Decisions

1. **Real facts over the known families** — LLM extracts facts; `planResearch` keeps mapping to the existing coverage families / `SOURCE_POINTERS`. No discovery of arbitrary new programs.
2. **Always LLM, no seeded fallback** — `parseScope` always calls the model. No key or a failure → a minimal **empty** `ScopePack` (most families `out_of_scope`/`blocked` → `needs_review`).
3. **Model:** OpenAI `gpt-4o-mini` (`OPENAI_INTAKE_MODEL` override), key from the server env (same as the intake route).

## Architecture

```
runResearch(input)                               # run.ts
  scope_pack = await parseScope(input, run_id)    # scope.ts — NOW async + LLM
        ├─ key present → OpenAI submit_scope tool → scopePackFromFacts(facts)
        └─ no key / error → emptyScope(run_id, description)
  plan = planResearch(scope_pack)                 # planner.ts — triggers loosened
        coverage families activated by REAL facts → variable hypotheses/tasks
  → workers (real or fixture) → verify → synth
```

### Components

- **`scope.ts`**
  - `parseScope(input, runId): Promise<ScopePack>` — **async**. Calls OpenAI with a `submit_scope` structured tool extracting: `facility.{address,naics,sic}`, `project_change.{equipment[{kind,description}], chemicals[{name,quantity,unit,hazard}], waste_streams[{description,kg_per_month}], disturbance_acres, process_discharge}`, plus `missing_facts[]` and `assumptions[]`. Maps the tool args via `scopePackFromFacts`. No key / any error → `emptyScope`.
  - `scopePackFromFacts(facts, runId, description): ScopePack` — **pure**, no I/O. Normalizes/defaults the extracted facts into a valid `ScopePack`. Unit-tested.
  - `emptyScope(runId, description): ScopePack` — **pure**. Minimal scope: empty equipment/chemicals/waste, null naics/sic/disturbance_acres/process_discharge, `missing_facts` noting extraction was unavailable. Unit-tested.
  - `createRunId`, `projectFacts` unchanged. `scenarios.ts` (`seededComplexScope` etc.) **stays** (still used by `toolCatalog.test`) but `parseScope` no longer imports it.
- **`planner.ts`** — loosen `coverageStatusFor` so real facts fire families:
  - **air**: `active` when `project_change.equipment.length > 0` (any added equipment may emit), else `out_of_scope`. (Was hard-coded to `["coating_booth","process_equipment"]`.)
  - **hazmat/waste/wastewater/stormwater**: already fact-driven; keep, with minor robustness (treat empty arrays / nulls correctly). Angles + hypotheses still map to the known programs so `SOURCE_POINTERS` stays valid. Pure → unit-tested with hand-built scopes.
- **`run.ts`** — `const scope_pack = await parseScope(input, run_id);` (it's already in an async function).

## Data flow

description (intake-composed or manual) → `runResearch` → `await parseScope` (LLM → ScopePack, or emptyScope) → `planResearch` (variable hypotheses by real facts) → research pool (fixture or Modal) → verifier → synthesis.

## Error handling

- No `OPENAI_API_KEY` or OpenAI error/timeout in `parseScope` → `emptyScope` (logged once, server-side). Downstream: families `out_of_scope`/`blocked` → determinations `needs_review`. Never throws out of `runResearch`.
- Malformed tool args → treated as a failure → `emptyScope`.

## Testing

- **Deterministic unit tests (carry CI):**
  - `scopePackFromFacts(facts,…)` — sample extracted facts → expected `ScopePack` shape/defaults.
  - `emptyScope(…)` — yields a scope where `planResearch` marks families `out_of_scope`/`blocked` (no determinations invented).
  - `planResearch` trigger-loosening — hand-built scopes: e.g. equipment-only scope → air active, hazmat `out_of_scope` → fewer tasks; full scope → more tasks. Asserts the **count varies with facts** (the whole point).
- **Golden evals (`golden.ts`)** — now exercise the LLM path, so they become **key-dependent + non-deterministic**. Relax to structural assertions (task count in a plausible range, `groundedVerified`, `needs_review` present) and document `OPENAI_API_KEY` is required. CI determinism lives in the unit tests above, not the golden.
- The real-worker path (PR #10) is unaffected; default fixture pool still works.

## Out of Scope

- Discovering arbitrary new programs / source pointers (the known families only).
- Passing the intake's already-extracted `IntakeFacts` straight through to `runResearch` (we keep the `project_description` contract). Note the **redundant double-extraction** (intake extracts facts → composes description → `parseScope` re-extracts) as a future optimization.
- Re-introducing deterministic seeded behavior for the demo (dropped per "always LLM").

## Success Criteria

1. Two different descriptions yield **different** ScopePacks and **different** agent counts (e.g. "two ovens, no chemicals" → air only, ~3 workers; "coating booth + 60 gal solvent + spent solvent" → air+hazmat+waste, ~9).
2. With no key, `runResearch` completes with an `emptyScope` → all `needs_review`, no crash, nothing fabricated.
3. `scopePackFromFacts` / `emptyScope` / `planResearch` trigger logic are unit-tested and deterministic; `pnpm typecheck` + `pnpm build` clean; the existing `toolCatalog`/`worker_core` tests stay green.
