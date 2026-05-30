# Person B UI — PermitPilot Truth Engine Frontend

**Date:** 2026-05-30
**Owner:** Person B (frontend)
**Backend contract:** `POST /api/research/run` → `ResearchRun` (Person A, already shipped)
**Goal:** Hackathon demo UI that visibly shows dynamic research graph expansion and the HMBP verify-fail → repair → verify-pass moment.

---

## 1. Scope

In scope:
- Single-page client UI rendered at `app/page.tsx`
- Consumes `POST /api/research/run` (no backend changes)
- Three sample-scenario buttons + free-text input
- Live-feeling staged replay of `trace_events`
- React Flow graph, applicability matrix, evidence drawer, jurisdiction & verification summary, trace stream
- Smoke tests for selectors, replay engine, and one scenario end-to-end

Out of scope (v2):
- Real SSE streaming from backend
- Re-running with user-supplied missing facts (input boxes are present but disabled with v2 tooltip)
- Authentication, persistence, history of past runs
- Markdown library — `report_markdown` rendered as `<pre>` initially

---

## 2. Tech Stack Decisions

| Decision | Choice | Why |
|---|---|---|
| Graph library | **React Flow** + dagre auto-layout | Mature, animated edges, ~50KB, fits node/edge model perfectly |
| State management | **Zustand** | One store, no Provider wrap, 4 panels need to share `run` + selection state |
| Trace animation | **Staged "fake stream" replay** | Backend returns full `ResearchRun` once; frontend replays `trace_events` on a timer for demo punch. Zero backend change. |
| Markdown render | `<pre>` (YAGNI; upgrade to `react-markdown` if needed in v2) | One field, demo doesn't depend on rich rendering |
| Components dir | `app/components/` | Next.js App Router convention |

---

## 3. Architecture & Data Flow

```
[user clicks sample button or Run]
    ↓
fetch POST /api/research/run
    ↓
ResearchRun (full payload, ~30-80KB JSON)
    ↓
Zustand store.setRun(run)
    ↓
useReplay() hook starts a timed walk through run.trace_events (sorted by ts)
    ├── each emit → store.tickReplay(eventId)
    ├── selectors derive: visible graph nodes, node statuses, matrix lock state,
    │   trace lines, side-panel counters
    └── on completion → store.replayDone = true, full UI unlocks for interaction
    ↓
User clicks a graph node or matrix row
    ↓
store.select(hypothesisId) + store.drawerOpen = true
    ↓
EvidenceDrawer renders sources, quotes, verifier checks, repair history
```

### Zustand store shape

```ts
type Store = {
  run: ResearchRun | null;
  isRunning: boolean;
  replayedEventIds: Set<string>;
  replayDone: boolean;
  selectedHypothesisId: string | null;
  drawerOpen: boolean;
  replaySpeed: 1 | 2;
  // actions
  startRun(payload: ResearchRunInput): Promise<void>;
  tickReplay(eventId: string): void;
  finishReplay(): void;
  select(hypothesisId: string | null): void;
  setDrawerOpen(open: boolean): void;
  setSpeed(s: 1 | 2): void;
  reset(): void;
};
```

### Module boundaries

| Module | Responsibility | Depends on |
|---|---|---|
| `src/lib/ui/store.ts` | Zustand store: holds run, selection, replay state | `ResearchRun` types |
| `src/lib/ui/useReplay.ts` | Hook: walks `trace_events` on a timer, calls `tickReplay` | store, types |
| `src/lib/ui/graphLayout.ts` | Pure fn: `(run, replayedEventIds) → { nodes, edges }` for React Flow, dagre-positioned | `ResearchRun` types, dagre |
| `src/lib/ui/selectors.ts` | Pure fns: counters, repair history, matrix filtering, missing facts | `ResearchRun` types |
| `app/page.tsx` | Layout shell + composes panels | store |
| `app/components/*` | Presentational components reading from store | store, selectors |

Pure functions in `src/lib/ui/` are independently testable. Components are thin presenters over selectors.

---

## 4. Layout & Component Tree

### Grid

```
┌─────────────────────────────────────────────────────┐
│ Header — logo · run_id · status badge · Reset       │
├──────────┬──────────────────────────┬───────────────┤
│  Input   │   ResearchGraph          │   SidePanel   │
│  Panel   │   (React Flow stage)     │   + Trace     │
│  320px   │   flex-1                 │   360px       │
├──────────┴──────────────────────────┴───────────────┤
│ BottomPanel: ApplicabilityMatrix | ReportTab        │
│   EvidenceDrawer slides over from right when open   │
└─────────────────────────────────────────────────────┘
```

### Component tree

```
app/page.tsx                      "use client"; grid shell, mounts useReplay
├── Header
├── InputPanel
│   ├── ScenarioButtons           3 buttons → store.startRun(payload)
│   ├── ProjectDescriptionInput   textarea + Run button
│   ├── MissingFactsCard          appears after run; inputs disabled, v2 tooltip
│   └── JurisdictionStack         appears after run
├── ResearchGraph
│   ├── ReactFlow                 controlled mode; nodes/edges from graphLayout()
│   ├── nodes/CoverageNode
│   ├── nodes/AngleNode
│   ├── nodes/HypothesisNode      handles state machine: pending/running/verified/failed/repairing
│   ├── nodes/TaskNode
│   └── ReplayControls            1×/2×/Skip top-right
├── SidePanel
│   ├── VerificationSummary       counters; click-to-filter
│   ├── CoverageFamilyList        9 families, status pills
│   ├── RepairTicketsCard         slides in when first ticket appears
│   └── TraceStream               scrolling event log, driven by replay
└── BottomPanel
    ├── ApplicabilityMatrix       table of determinations; click row → drawer
    ├── EvidenceDrawer            fixed right; sources, quote, checks, repair history
    └── ReportTab                 <pre>{report_markdown}</pre>
```

### Files

```
app/page.tsx
app/components/
  Header.tsx
  InputPanel.tsx
  ScenarioButtons.tsx
  MissingFactsCard.tsx
  JurisdictionStack.tsx
  ResearchGraph.tsx
  ReplayControls.tsx
  nodes/CoverageNode.tsx
  nodes/AngleNode.tsx
  nodes/HypothesisNode.tsx
  nodes/TaskNode.tsx
  SidePanel.tsx
  VerificationSummary.tsx
  CoverageFamilyList.tsx
  RepairTicketsCard.tsx
  TraceStream.tsx
  BottomPanel.tsx
  ApplicabilityMatrix.tsx
  EvidenceDrawer.tsx
  ReportTab.tsx
src/lib/ui/
  store.ts
  useReplay.ts
  graphLayout.ts
  selectors.ts
  scenarios.ts                    button payloads (single source of truth)
src/lib/ui/__tests__/
  graphLayout.test.ts
  selectors.test.ts
  useReplay.test.tsx              fake timers
  scenarios.smoke.test.ts         runs Complex scenario → asserts HMBP repair triggers
app/components/__tests__/
  EvidenceDrawer.test.tsx
```

### New dependencies

```
reactflow                          ^11
dagre                              ^0.8
@types/dagre                       ^0.7
zustand                            ^4
vitest, @testing-library/react,
  @testing-library/jest-dom,
  jsdom                            for tests
```

---

## 5. The HMBP Demo Moment — Exact Replay Timing

Total replay duration ≈ **6.0 seconds** (sum of delays in the table below). Speed-toggle: 1× / 2× / Skip.

| Step | Event (from trace_events) | Delay | Visual side effects |
|---|---|---|---|
| 1 | `scope_agent / scope / running` | 0 | Trace shows spinner row; graph empty |
| 2 | `scope_agent / scope / done` | 400ms | Trace row 1 → ✓ |
| 3 | `orchestrator / coverage / done` | 400ms | 9 coverage-family nodes fade in (80ms stagger); CoverageFamilyList fills |
| 4 | `orchestrator / task_graph / done` | 600ms | Angle → hypothesis → task subtrees expand under each active coverage, 200ms per layer; all gray = pending |
| 5 | `research_pool / fanout / running` | 300ms | All task nodes → dashed-blue border + subtle pulse |
| 6 | `research_pool / fanout / done` | **1200ms** (intentional dwell) | Task nodes → green ✓, evidence-count badges appear. HMBP task is also green here (verifier hasn't run yet) |
| 7 | `verifier / verification / failed` (HMBP) | 500ms | HMBP hypothesis node → red ✗ border + 200ms CSS shake. Trace adds red row. VerificationSummary failed counter +1 |
| 8 | `orchestrator / repair_ticket / queued` | 600ms | RepairTicketsCard slides in with one card showing observed problem + repair action. HMBP node → orange 🔧 border with spinning icon |
| 9 | `verifier / repair_verification / done` | **1500ms** (intentional dwell — "agent is redoing the work") | HMBP node → green ✓. Trace adds green row. Repair card → green background + "✓ resolved" badge |
| 10 | `synthesis_agent / matrix / done` | 500ms | Matrix unlocks from skeleton to full table. HMBP row: `Applies: Yes / Verified ✓ / 60 gal ≥ 55 gal threshold`. Needs-review rows highlighted yellow. Report tab clickable |

**Replay completion:** `store.replayDone = true`. Graph nodes become fully interactive (click → drawer). During replay, node clicks only `select` (no drawer pop) to avoid stealing focus.

### Node state machine

```
hidden → pending → running → verified
                          ↘ failed → repairing → verified
```

Each state has a className on the node component. CSS transitions handle the color shifts.

### Edge cases

| Case | Behavior |
|---|---|
| User clicks Run mid-replay | Cancel current replay, reset store, start fresh |
| API returns 500 | InputPanel red banner with message; existing run untouched |
| User clicks Skip | Mark all events replayed, jump to terminal state |
| API returns `determinations: []` | Matrix shows "No determinations — likely all coverage families blocked. See Missing Facts." |
| `trace_events` order surprises | Replay is keyed by `event.id`; ordering is by `ts` ascending |

---

## 6. Failure / Needs-Review Visibility (No Silent Failure)

| State | Source field | Graph node | Matrix row | SidePanel | Trace |
|---|---|---|---|---|---|
| **failed** (open) | `verification_verdicts[].verdict === "fail"` without a subsequent passing repair | red ✗ + shake | red bg, `Applies: ?` | failed +1 | red line |
| **needs_review** | `determinations[].review_flag === true` | yellow ⚠ | yellow bg, `Applies: needs_review` | needs_review +1 | yellow line |
| **blocked_missing_fact** | `coverage_family_statuses[].status === "blocked_missing_fact"` | gray + 🔒, subtree not expanded | placeholder row "Cannot determine — missing: {field}" | CoverageFamilyList shows "blocked: needs disturbance_acres" | gray line |

### VerificationSummary card

```
┌─ Verification Summary ──────────┐
│  ✓ Verified         5           │
│  ⚠ Needs Review     3           │
│  ✗ Failed (open)    0 / was 1   │  ← was-N format so repair credit is visible
│  🔧 Repairs ran     1           │
│  🔒 Blocked         2           │
└─────────────────────────────────┘
```

Counters are click-to-filter: clicking "Needs Review 3" filters the matrix to those rows and dims unrelated graph nodes.

### Missing facts

`MissingFactsCard` reads `scope_pack.missing_facts[]`. For each:
- Field name, why_needed, blocks list
- Disabled input with tooltip "Provide value (v2 feature)"

### EvidenceDrawer — repair history

When the selected hypothesis has multiple `verification_verdicts` and/or `repair_tickets`, drawer shows a collapsible "Repair History" block at top:

```
🔧 1 repair attempt
─ Attempt 1 — FAILED
  Failed check: claim_too_broad
  Original quote: "HMBP applies to all hazardous material..."
  Verifier reason: "Quote only addresses threshold qty"
─ Attempt 2 — PASSED ✓
  Repair action: "Re-extract with 55 gal threshold context"
  New quote: "Businesses storing ≥ 55 gal..."
```

Built from `verification_verdicts` (multiple entries for same hypothesis_id) + `repair_tickets` + multiple `evidence_bundles`. No backend changes.

### Empty / loading states

| Scenario | UI |
|---|---|
| First load | Graph empty state: "Pick a sample or describe a project on the left" |
| API in flight | Run button spinner; other panels unchanged |
| Run succeeded, `determinations: []` | Matrix placeholder pointing to Missing Facts |

---

## 7. Sample Scenarios

Single source of truth: `src/lib/ui/scenarios.ts`.

```ts
export const SCENARIOS = [
  {
    id: "complex",
    label: "Complex SoCal Manufacturing",
    subtitle: "9 families · 1 repair · HMBP reversal",
    payload: {
      project_description:
        "Adding a new sheet metal degreasing line in Los Angeles County. " +
        "Solvent: 60 gallons of trichloroethylene (TCE) on-site at all times. " +
        "Process generates 200 kg/month of spent solvent waste. " +
        "Site disturbance during install: 0.3 acres. " +
        "Discharges 1,500 gal/day rinse water to municipal sewer. " +
        "NAICS 332813.",
      demo_documents: [],
    },
  },
  {
    id: "simple",
    label: "Simple Construction (1.2 acres)",
    subtitle: "Tests construction-stormwater YES path",
    payload: {
      project_description:
        "Single-family residential site grading in Sacramento County. " +
        "Total ground disturbance: 1.2 acres. " +
        "No chemicals on-site. No process water. No emissions equipment.",
      demo_documents: [],
    },
  },
  {
    id: "missing",
    label: "Missing Facts",
    subtitle: "Tests blocked / needs_review states",
    payload: {
      project_description:
        "Light manufacturing facility in Orange County. " +
        "Adding a new production line. Details TBD.",
      demo_documents: [],
    },
  },
] as const;
```

### Expected backend output per scenario

| Button | jurisdiction | research_graph | repair_tickets | determinations must include |
|---|---|---|---|---|
| Complex | SCAQMD / LA County / CA | ≥ 6 hypotheses | 1 (HMBP) | HMBP=yes verified, hazwaste=yes, wastewater=yes |
| Simple | Sacramento / CA | ≥ 1 (construction stormwater) | 0 | construction-stormwater = yes |
| Missing | Orange County / CA | possibly 0 | 0 | mostly needs_review + multiple missing_facts |

### Smoke test (prevents demo-day failure)

```ts
// src/lib/ui/__tests__/scenarios.smoke.test.ts
test("complex scenario triggers HMBP repair", async () => {
  const run = await runResearch(SCENARIOS[0].payload);
  expect(run.repair_tickets.length).toBeGreaterThan(0);
  expect(
    run.determinations.some(d => d.requirement.includes("HMBP") && d.verified)
  ).toBe(true);
});
```

Runs as part of `pnpm eval` extension or `pnpm test`. Failure ⇒ demo highlight is broken; do not ship.

---

## 8. Demo Script (for the presenter)

1. Click **"Complex SoCal Manufacturing"** button.
2. As graph grows: *"The agent autonomously planned 9 coverage families and N hypotheses — no hardcoded checklist."*
3. At ~4s when HMBP turns red: *"Notice — it first concluded HMBP applies to all hazmat storage. The verifier rejected that as overbroad."*
4. At ~6s when HMBP turns green: *"The agent opened a repair ticket, re-extracted with the 55-gallon threshold, and the new claim verified."*
5. On completion: click HMBP node → drawer opens → show source URL, quote, verifier checks, and the full repair history.

---

## 9. Performance & Bundle

- React Flow + dagre + Zustand ≈ 80KB gzipped (acceptable for hackathon)
- Each ResearchRun JSON ≈ 30–80KB
- First paint (empty state): < 1s
- Replay: 60fps target; each frame changes only 1–2 node classNames

---

## 10. Verification Before Done

Add to `package.json` scripts (currently absent):
```json
"test": "vitest run",
"test:watch": "vitest"
```

Then:
```bash
pnpm typecheck
pnpm build
pnpm eval                # existing Person A evals must still pass
pnpm test                # new vitest suite (selectors, replay, scenario smoke)
pnpm dev                 # manual: click each of 3 scenario buttons,
                         # confirm HMBP reversal visible, drawer opens, no console errors
```

---

## 11. Open Risks

| Risk | Mitigation |
|---|---|
| Scenario button strings don't match backend `parseScope` heuristics → wrong fixture chosen → no HMBP repair | Smoke test (§7) catches this before demo |
| React Flow re-renders too often during replay (perf) | Memoize `graphLayout()` output by `(run, replayedEventIds.size)`; use stable node ids |
| Replay feels jerky on slow laptop | Speed toggle defaults to 1× but Skip available; CSS transitions, not JS animation |
| Drawer covers too much screen during demo | Drawer width 400px max; overlays BottomPanel only |
