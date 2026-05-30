# "Agents Working" — Modal Sandbox Grid (post-intake illustration)

**Date:** 2026-05-30
**Author:** Person B (UI)
**Status:** Approved design, ready for implementation plan
**Base:** the team's `main` UI (React Flow + Zustand `useStore` + `useReplay`).

## Goal

After the conversational intake, show a marvis-style "control room" illustration of the research swarm working — one **Modal sandbox tile per worker** — animated off the existing replay timeline, building to the HMBP verifier-fail → repair beat, then hand off to the team's existing React Flow graph for inspection.

## Approved Decisions

1. **Visual:** sandbox grid ("control room") — a grid of tiles, one per worker, each showing live status.
2. **Three phases**, driven by the team's Zustand store:
   - **Intake** — ported `IntakeChat` (full-screen). On completion calls **`useStore().startRun({ project_description })`**.
   - **Swarm running** — when `run` is set and `!replayDone`, the center pane shows `SandboxGrid` (animated off `replayedEventIds`).
   - **Results** — when `replayDone`, the center pane shows the team's existing `ResearchGraph`.
3. **Phase swap, not replacement:** the sandbox grid is the "watch it happen" view; the React Flow graph remains the "explore the result" view. Header / SidePanel / BottomPanel / EvidenceDrawer persist.
4. **Derived illustration, no backend change:** Modal returns only `EvidenceBundle`s — there is no per-sandbox telemetry. Tile states are derived from `research_tasks` + the coarse trace timeline + `verification_verdicts` / `repair_tickets` / `coverage_family_statuses`. Honest, approximated, no Person A change.
5. **Intake reuse:** the OpenAI intake (route + `src/lib/intake/*`, including the completeness gate) is ported from the `feat/intake-chat` branch and retargeted to the store.

## Architecture

```
IntakeChat (full-screen, client)
  -> useStore().startRun({ project_description })   (team store; POSTs /api/research/run)
       -> run set; useReplay() walks trace_events on a timer (existing)
  Center pane (in app/page.tsx):
    run && !replayDone   -> <SandboxGrid />          (NEW marvis view)
    replayDone           -> <ResearchGraph />         (existing team graph)
    no run (not skipped) -> <IntakeChat />            (NEW intake gate)
```

### Units and responsibilities

- **`src/lib/ui/sandboxState.ts`** (new, pure) — `deriveSandboxTiles(run, replayedEventIds): SandboxTile[]`. One tile per `research_task` (= one Modal sandbox), plus muted tiles for coverage families with no active task (e.g. wastewater out-of-scope). Each tile: `{ id, family, label, status, sourceName? }` where `status ∈ "queued" | "booting" | "fetching" | "evidence" | "verifying" | "verified" | "failed" | "repairing" | "repaired" | "needs_review" | "out_of_scope"`. **Unit-tested.**
- **`app/components/SandboxGrid.tsx`** (new, client) — reads `run` + `replayedEventIds` from `useStore`, renders the tile grid with status styling + a "N workers spawned" header. Pure presentation over `deriveSandboxTiles`.
- **`app/components/IntakeChat.tsx`** (new, ported) — full-screen chat; calls `useStore().startRun`. Error/no-key path reveals "skip to manual entry" (sets the page's manual phase, falling back to the existing `InputPanel`).
- **`app/api/intake/chat/route.ts`** + **`src/lib/intake/{types,prompt,compose,complete}.ts`** (ported from `feat/intake-chat`, unchanged) — OpenAI tool-calling intake + server-side completeness gate.
- **`app/page.tsx`** (modify) — add the phase gate: intake → grid → graph, with a manual-entry escape hatch.

### Tile state machine (derived)

Timing from the global replay phase; terminal state from the run artifacts:
- before `research_pool/fanout/running` replayed → `queued`
- `research_pool/fanout/running` replayed → `booting` → `fetching`
- `research_pool/fanout/done` replayed → `evidence` → `verifying`
- once the tile's hypothesis verifier events are replayed → terminal:
  - `verification_verdicts[hid].verdict === "pass"` and no repair → `verified`
  - a `repair_tickets[hid]` exists → `failed` → `repairing` → `repaired` (if a later pass) 
  - `verdict === "needs_review"` → `needs_review`
  - coverage family `out_of_scope`/`blocked_missing_fact` with no task → `out_of_scope` / muted
- HMBP (`H-HAZMAT-HMBP`) is the scripted ✗ → repairing → ✓ beat.

## Data Flow

1. App opens → `IntakeChat` (intake phase).
2. Chat gathers facts → `submit_intake` → route gate (`isIntakeComplete`) → composed `project_description`.
3. `IntakeChat` calls `useStore().startRun({ project_description })` → store POSTs `/api/research/run` → sets `run`.
4. `useReplay` (already mounted) walks the trace; `SandboxGrid` tiles flip state as `replayedEventIds` grows.
5. On `replayDone`, the center pane swaps to `ResearchGraph`; SidePanel/matrix/drawer become interactive (existing behavior).

## Error Handling

- No `OPENAI_API_KEY` → intake route 503 → `IntakeChat` shows a banner + "skip to manual entry" → page falls back to the existing `InputPanel` (scenario buttons + manual run). Demo never dead-ends.
- `startRun` failure → store sets `runError`; surfaced by existing UI (and the grid is not shown).

## Testing

- **Unit (vitest):** `deriveSandboxTiles` — tile count equals active tasks + muted families; HMBP tile reaches `repaired` given a verdict+repair; a `needs_review` verdict yields a `needs_review` tile; an `out_of_scope` family yields a muted tile; mid-replay (partial `replayedEventIds`) yields in-progress statuses.
- Ported `composeProjectDescription` / `isIntakeComplete` tests come along.
- The team's existing UI tests (store, selectors, graphLayout, useReplay, scenarios, EvidenceDrawer) must remain green.

## Out of Scope (YAGNI)

- Real per-sandbox log streaming or live Modal telemetry.
- Token streaming in the chat.
- Persisting conversations.
- Replacing or restyling the team's React Flow graph.

## Success Criteria

1. App opens to the intake chat; completing it triggers `startRun`.
2. While the run replays, the center pane shows the sandbox grid with tiles flipping booting → fetching → verified, and HMBP visibly ✗ → repairing → ✓.
3. When replay finishes, the team's React Flow graph + matrix + drawer take over.
4. No `OPENAI_API_KEY` degrades to manual entry.
5. `deriveSandboxTiles` is unit-tested; `pnpm build` and `pnpm test` (team's suite + new tests) pass.
