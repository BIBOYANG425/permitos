# Report View Redesign — Sectioned Cards + Detail/Permit Overlay

Updated: 2026-05-30
Project: EHS Permit-Navigator (PermitPilot)
Status: Approved design, ready for implementation plan

## Goal

Replace the current BottomPanel (flat matrix table + raw markdown report) with a coverage-family cards grid. Clicking a card opens a frosted full-page overlay showing synthesis detail on the left and the worker-discovered permit form on the right.

## What Changes

| Before | After |
|---|---|
| BottomPanel with two tabs: "matrix" (table) and "report" (raw markdown `<pre>`) | Cards grid grouped by coverage family, replaces entire BottomPanel |
| Click matrix row → EvidenceDrawer slides in from right | Click card → full-page frosted overlay with detail (left) + permit (right) |
| No permit information anywhere | Workers discover permit forms; overlay shows them |
| ReportTab dumps `report_markdown` as monospace text | Removed — synthesis detail lives in the overlay |

## Type Changes

### Extend `EvidenceBundle`

Add an optional `permit_filing` field. Workers discover the permit form/portal URL as part of their source research.

```ts
// add to EvidenceBundle in types.ts
permit_filing?: {
  form_name: string;        // "SCAQMD Permit to Construct Application"
  form_url: string;         // URL to the actual form PDF or portal page
  agency: string;           // "South Coast AQMD"
  portal_url: string;       // agency filing portal landing page
  instructions?: string;    // brief note like "Submit through CERS portal"
};
```

### Extend `Determination`

Synthesis carries the permit filing through to the final output so the overlay reads it from determinations.

```ts
// add to Determination in types.ts
permit_filing?: {
  form_name: string;
  form_url: string;
  agency: string;
  portal_url: string;
  instructions?: string;
};
```

### Extend `SourceFixture`

Each source fixture in `fixtures/sources.ts` gains a `permit_filing` entry so the seeded demo surfaces real agency URLs.

```ts
// add to SourceFixture in types.ts
permit_filing?: {
  form_name: string;
  form_url: string;
  agency: string;
  portal_url: string;
  instructions?: string;
};
```

## Fixture Permit Data

Add `permit_filing` to each source fixture in `fixtures/sources.ts`:

| Fixture | form_name | agency | portal_url |
|---|---|---|---|
| `scaqmd_rule_201` | SCAQMD Permit to Construct Application | South Coast AQMD | https://www.aqmd.gov/home/permits |
| `scaqmd_rule_219` | SCAQMD Rule 219 Exemption Worksheet | South Coast AQMD | https://www.aqmd.gov/home/permits |
| `scaqmd_rule_222` | SCAQMD Rule 222 Registration | South Coast AQMD | https://www.aqmd.gov/home/permits |
| `industrial_general_permit` | SMARTS IGP Notice of Intent | California Water Boards | https://smarts.waterboards.ca.gov/ |
| `construction_general_permit` | SMARTS CGP Notice of Intent | California Water Boards | https://smarts.waterboards.ca.gov/ |
| `hmbp_threshold_bad` | Hazardous Materials Business Plan (HMBP) | CalEPA / Local CUPA | https://cers.calepa.ca.gov/ |
| `hmbp_threshold_repaired` | Hazardous Materials Business Plan (HMBP) | CalEPA / Local CUPA | https://cers.calepa.ca.gov/ |
| `hazardous_waste_generator` | EPA Hazardous Waste Generator Registration | EPA / DTSC | https://hwts.dtsc.ca.gov/ |
| `wastewater_pretreatment` | Industrial Wastewater Discharge Permit Application | Local POTW | (varies by municipality) |

The `form_url` for each should point to the actual form PDF or application page on the agency website when available, or to the portal landing page as fallback.

## Pipeline Changes

### workers.ts

When building an `EvidenceBundle` from a fixture, copy the fixture's `permit_filing` into the bundle:

```ts
permit_filing: fixture.permit_filing
```

### synthesis.ts

In `determinationFor()`, carry `permit_filing` from the evidence bundle to the determination:

```ts
permit_filing: evidence?.permit_filing
```

No permit_filing for determinations where evidence is missing or the verdict is not "pass".

## Cards Grid — `ReportCards.tsx`

Replaces `BottomPanel.tsx` in the page layout. Renders after replay completes (same `replayDone` guard as the old matrix).

### Layout

`grid grid-cols-5` for the 5 coverage families. Each card:

```
┌─────────────────────────┐
│ ▌ Air Quality            │  ← left border color by status
│                          │
│ SCAQMD Permit + Rule 219 │  ← short overview (determination names)
│ + VOC + Rule 222         │
│                          │
│ ● 3 verified  ● 1 review │  ← status badges
└─────────────────────────┘
```

### Card Status Logic

- **Left border green** — all determinations in the family are verified
- **Left border amber** — at least one needs_review
- **Left border red** — at least one blocked by missing fact
- **Dimmed + not clickable** — family is `out_of_scope` (shows "Not triggered")

### Data Source

New selector `groupDeterminationsByFamily(run)`:

```ts
type FamilyReport = {
  family: CoverageFamily;
  familyStatus: CoverageFamilyStatus;
  determinations: Determination[];
  evidenceBundles: EvidenceBundle[];
  verdicts: VerificationVerdict[];
  repairTickets: RepairTicket[];
};

function groupDeterminationsByFamily(run: ResearchRun): Map<CoverageFamily, FamilyReport>;
```

This selector uses the `research_graph` (hypothesis → angle → family chain) to map each determination back to its coverage family. Each `FamilyReport` bundles all artifacts for that family.

## Full-Page Overlay — `ReportOverlay.tsx`

### Trigger

Clicking a non-dimmed card calls `store.openReport(family)`. Overlay renders when `store.reportFamily !== null`.

### Container

```
position: fixed; inset: 0; z-index: 50;
background: rgba(2, 6, 23, 0.92);       /* slate-950/92 */
backdrop-filter: blur(4px);
```

Contains a centered panel:
```
max-width: 1400px; margin: auto;
height: calc(100vh - 48px); margin-top: 24px;
border-radius: 12px;
border: 1px solid slate-700;
background: slate-900;
display: grid; grid-template-columns: 1fr 1fr;
overflow: hidden;
```

### Close

- ✕ button top-right corner of the panel
- Click backdrop (outside the panel)
- Press Escape (keyboard listener)
- All call `store.closeReport()`

## Left Pane — `SynthesisDetail.tsx`

Scrollable. Shows all determinations in the selected family.

### Header

```
Family name (large)
Status badges: N verified, N needs_review, N repaired
```

### Per-Determination Sections

For each determination in the family, render a card:

**1. Determination summary**
```
Requirement name
Applies: yes/no/needs_review
Trigger: [hypothesis question]
Project fact: [matched fact]
Confidence: 0.XX
```

**2. Source evidence**
```
Source name (linked to URL)
Quote (blockquote with sky-400 left border)
Fetched date · content hash (truncated)
```

**3. Verifier checks**
```
✓/✗ currency: reason
✓/✗ authority: reason
✓/✗ grounding: reason
✓/✗ predicate_math: reason
```

**4. Repair history** (if any repair tickets exist for this hypothesis)
```
Attempt 1 — FAIL (grounding)
  Reason: Claim was broader than supporting quote
  Action: rerun extraction with quote-constrained prompt
Attempt 2 — PASS
  Quote: "...55 gallons for liquids..."
```

Sections 2-4 use the same rendering logic currently in `EvidenceDrawer.tsx`. That component's internals can be extracted and reused.

## Right Pane — `PermitPane.tsx`

Fixed (not scrollable independently). Shows the permit for the selected family.

### When `permit_filing` exists

```
┌──────────────────────────────┐
│ PERMIT TO FILE               │  ← label
│ Hazardous Materials          │  ← form_name
│ Business Plan (HMBP)         │
│ CalEPA / Local CUPA          │  ← agency
│                              │
│ ┌──────────────────────────┐ │
│ │                          │ │
│ │    <iframe>              │ │  ← embedded PDF from form_url
│ │    or portal preview     │ │
│ │                          │ │
│ └──────────────────────────┘ │
│                              │
│ Submit through CERS portal   │  ← instructions
│                              │
│ [ Open Filing Portal → ]     │  ← button linking to portal_url
└──────────────────────────────┘
```

If `form_url` ends in `.pdf`, render in `<iframe src={form_url}>` with a fallback link if the browser blocks embedding. Otherwise render the portal page link prominently.

### When a family has multiple permits

Air Quality has up to 4 determinations (Permit to Construct, VOC, Rule 219, Rule 222), each potentially with its own permit_filing.

Render a **tab row** at the top of the right pane to switch between permits. Tabs show the `form_name`. Only determinations with a `permit_filing` get a tab.

### When no `permit_filing` exists

For `needs_review`, `blocked_missing_fact`, or determinations where the worker didn't find a form:

```
┌──────────────────────────────┐
│                              │
│     📋                       │
│     Permit not yet           │
│     identified               │
│                              │
│     Resolve missing facts    │
│     or review evidence to    │
│     determine filing         │
│     requirements.            │
│                              │
└──────────────────────────────┘
```

## Store Changes

Add to `Store` type and `useStore`:

```ts
// new state
reportFamily: CoverageFamily | null;

// new actions
openReport: (family: CoverageFamily) => void;
closeReport: () => void;
```

`openReport` sets `reportFamily`. `closeReport` sets it to `null`.

## New Selector

Add to `src/lib/ui/selectors.ts`:

```ts
export type FamilyReport = {
  family: CoverageFamily;
  familyStatus: CoverageFamilyStatus;
  determinations: Determination[];
  evidenceBundles: EvidenceBundle[];
  verdicts: VerificationVerdict[];
  repairTickets: RepairTicket[];
};

export function groupDeterminationsByFamily(run: ResearchRun): Map<CoverageFamily, FamilyReport>;
```

Implementation: iterate `run.research_graph`, map each hypothesis to its family via `hypothesis.family`, then group the corresponding determination (by index alignment), evidence bundle, verdict, and repair tickets.

## Page Layout Change

In `app/page.tsx`, replace `<BottomPanel />` with `<ReportCards />` and add `<ReportOverlay />` as a sibling:

```tsx
<div className="grid grid-rows-[auto_1fr_auto] h-screen ...">
  <Header />
  <div className="grid grid-cols-[320px_minmax(0,1fr)_360px] ...">
    <InputPanel />
    <main><ResearchGraph /></main>
    <SidePanel />
    <EvidenceDrawer />
  </div>
  <ReportCards />       {/* was: <BottomPanel /> */}
  <ReportOverlay />     {/* new: renders when reportFamily !== null */}
</div>
```

## Components to Remove

| File | Reason |
|---|---|
| `BottomPanel.tsx` | Replaced by `ReportCards.tsx` |
| `ReportTab.tsx` | Raw markdown dump no longer needed |

`ApplicabilityMatrix.tsx` can be removed or kept as a debug/export view. The primary report flow no longer uses it.

`EvidenceDrawer.tsx` remains for the graph-view click interaction (clicking a hypothesis node in the React Flow graph). The overlay's `SynthesisDetail` reuses the same rendering patterns but is a separate component scoped to the overlay context.

## New Components Summary

| Component | File | Purpose |
|---|---|---|
| `ReportCards` | `app/components/ReportCards.tsx` | Cards grid by coverage family, replaces BottomPanel |
| `ReportOverlay` | `app/components/ReportOverlay.tsx` | Frosted full-page overlay container, close logic |
| `SynthesisDetail` | `app/components/SynthesisDetail.tsx` | Left pane: determination + evidence + checks + repair per family |
| `PermitPane` | `app/components/PermitPane.tsx` | Right pane: permit PDF/portal viewer with tabs for multi-permit families |

## Out of Scope

- Generating pre-filled permit PDFs from determination data
- Storing permit PDFs in the repo
- Multi-state permit forms
- Filing submission or portal authentication
- Print/export of the synthesis report
