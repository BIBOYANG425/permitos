# Person B UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PermitPilot Truth Engine frontend that consumes `POST /api/research/run` and visually demonstrates dynamic research-graph expansion + the HMBP verify→repair→verify reversal moment.

**Architecture:** Single-page Next.js client component. Zustand store holds the `ResearchRun` and replay state. A `useReplay` hook walks `trace_events` on a timer and drives visual state changes across four panels: InputPanel, ResearchGraph (React Flow), SidePanel (verification summary + trace), BottomPanel (matrix + drawer). Backend unchanged.

**Tech Stack:** Next 15, React 19, TypeScript, React Flow + dagre, Zustand, Vitest + Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-05-30-person-b-ui-design.md`

---

## File Plan

```
NEW:
  src/lib/ui/store.ts                 Zustand store
  src/lib/ui/useReplay.ts             Replay hook
  src/lib/ui/graphLayout.ts           Build React Flow nodes/edges with dagre
  src/lib/ui/selectors.ts             Counters, repair history, matrix filters
  src/lib/ui/scenarios.ts             Sample scenario payloads
  src/lib/ui/__tests__/*.test.ts(x)   Vitest suites
  app/components/Header.tsx
  app/components/InputPanel.tsx
  app/components/ScenarioButtons.tsx
  app/components/MissingFactsCard.tsx
  app/components/JurisdictionStack.tsx
  app/components/ResearchGraph.tsx
  app/components/ReplayControls.tsx
  app/components/nodes/CoverageNode.tsx
  app/components/nodes/AngleNode.tsx
  app/components/nodes/HypothesisNode.tsx
  app/components/nodes/TaskNode.tsx
  app/components/SidePanel.tsx
  app/components/VerificationSummary.tsx
  app/components/CoverageFamilyList.tsx
  app/components/RepairTicketsCard.tsx
  app/components/TraceStream.tsx
  app/components/BottomPanel.tsx
  app/components/ApplicabilityMatrix.tsx
  app/components/EvidenceDrawer.tsx
  app/components/ReportTab.tsx
  app/globals.css                     animations + state classes
  vitest.config.ts
  src/test/setup.ts                   jsdom setup
MODIFY:
  app/page.tsx                        replace placeholder with grid shell
  app/layout.tsx                      import globals.css
  package.json                        add deps + test scripts
  tsconfig.json                       include vitest globals if needed
```

---

### Task 1: Add deps, test infra, and globals.css

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Install runtime deps**

```bash
cd "/Users/cyrusgu/Desktop/antler hackson/permitpilot"
pnpm add reactflow dagre zustand
pnpm add -D @types/dagre vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitejs/plugin-react
```

- [ ] **Step 2: Add scripts to package.json**

Edit `package.json` scripts to add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}", "app/**/__tests__/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Create src/test/setup.ts**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Create app/globals.css**

```css
:root {
  --bg: #0f1115;
  --panel: #161922;
  --panel-2: #1b1f2a;
  --border: #262b38;
  --text: #e6e8ee;
  --text-dim: #9aa3b2;
  --accent: #5b9bd5;
  --green: #3ecf8e;
  --yellow: #f5c451;
  --red: #ef5a6f;
  --orange: #f59e0b;
  --gray: #6b7280;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; }

.node {
  padding: 8px 12px;
  border-radius: 8px;
  border: 2px solid var(--border);
  background: var(--panel);
  font-size: 12px;
  min-width: 140px;
  transition: border-color 200ms, background 200ms, opacity 200ms;
}
.node[data-status="hidden"] { opacity: 0; pointer-events: none; }
.node[data-status="pending"] { opacity: 0.5; border-color: var(--gray); }
.node[data-status="running"] { border-color: var(--accent); border-style: dashed; animation: pulse 1.2s infinite; }
.node[data-status="verified"] { border-color: var(--green); }
.node[data-status="failed"] { border-color: var(--red); animation: shake 200ms; }
.node[data-status="repairing"] { border-color: var(--orange); }
.node[data-status="blocked"] { border-color: var(--gray); opacity: 0.6; }

@keyframes pulse { 50% { opacity: 0.7; } }
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

.row-verified { background: rgba(62, 207, 142, 0.08); }
.row-needs-review { background: rgba(245, 196, 81, 0.12); }
.row-failed { background: rgba(239, 90, 111, 0.12); }
```

- [ ] **Step 6: Modify app/layout.tsx to import globals.css**

Replace the file with:
```tsx
import "./globals.css";

export const metadata = { title: "PermitPilot Truth Engine" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Verify install + types**

Run: `pnpm typecheck`
Expected: PASS (no usage yet of new deps).

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/test app/globals.css app/layout.tsx
git commit -m "chore(ui): add reactflow, zustand, vitest infra"
```

---

### Task 2: Sample scenarios module (pure data)

**Files:**
- Create: `src/lib/ui/scenarios.ts`
- Create: `src/lib/ui/__tests__/scenarios.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/ui/__tests__/scenarios.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SCENARIOS } from "../scenarios";

describe("SCENARIOS", () => {
  it("has exactly 3 buttons", () => {
    expect(SCENARIOS).toHaveLength(3);
  });

  it("complex payload routes to complex scope (no missing/construction trigger words)", () => {
    const p = SCENARIOS.find((s) => s.id === "complex")!.payload.project_description.toLowerCase();
    expect(p.includes("1.2 acre")).toBe(false);
    expect(p.includes("construction")).toBe(false);
    expect(p.includes("missing")).toBe(false);
    expect(p.includes("unknown")).toBe(false);
    expect(p.includes("omit")).toBe(false);
  });

  it("simple payload contains '1.2 acre' to route to construction scope", () => {
    const p = SCENARIOS.find((s) => s.id === "simple")!.payload.project_description.toLowerCase();
    expect(p.includes("1.2 acre")).toBe(true);
  });

  it("missing payload contains 'unknown' to route to missing scope", () => {
    const p = SCENARIOS.find((s) => s.id === "missing")!.payload.project_description.toLowerCase();
    expect(p.includes("unknown") || p.includes("missing") || p.includes("omit")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

Run: `pnpm test -- scenarios.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement scenarios.ts**

```ts
import type { ResearchRunInput } from "@/lib/research/types";

export type Scenario = {
  id: "complex" | "simple" | "missing";
  label: string;
  subtitle: string;
  payload: ResearchRunInput;
};

export const SCENARIOS: readonly Scenario[] = [
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
        "Total ground disturbance: 1.2 acres of construction work. " +
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
        "Adding a new production line. Most operational details are currently unknown.",
      demo_documents: [],
    },
  },
] as const;
```

- [ ] **Step 4: Run test, confirm pass**

Run: `pnpm test -- scenarios.test`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/scenarios.ts src/lib/ui/__tests__/scenarios.test.ts
git commit -m "feat(ui): add demo scenario payloads"
```

---

### Task 3: Selectors (pure functions)

**Files:**
- Create: `src/lib/ui/selectors.ts`
- Create: `src/lib/ui/__tests__/selectors.test.ts`

- [ ] **Step 1: Write failing tests**

`src/lib/ui/__tests__/selectors.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { ResearchRun, VerificationVerdict, RepairTicket, EvidenceBundle, Determination } from "@/lib/research/types";
import { getVerificationCounts, getRepairHistory, isHypothesisVisible } from "../selectors";

function makeRun(overrides: Partial<ResearchRun> = {}): ResearchRun {
  return {
    run_id: "test",
    status: "done",
    project_facts: {},
    jurisdiction_stack: [],
    scope_pack: {} as never,
    coverage_family_statuses: [],
    regulatory_angles: [],
    research_graph: [],
    research_tasks: [],
    evidence_bundles: [],
    verification_verdicts: [],
    repair_tickets: [],
    memory_updates: [],
    determinations: [],
    trace_events: [],
    report_markdown: "",
    ...overrides,
  };
}

describe("getVerificationCounts", () => {
  it("counts verified, needs_review, blocked, and credits repairs", () => {
    const run = makeRun({
      determinations: [
        { requirement: "A", applies: "yes", trigger: "", project_fact: "", citation: "", quote: "", source_url: "", confidence: 0.9, verified: true, review_flag: false },
        { requirement: "B", applies: "needs_review", trigger: "", project_fact: "", citation: "", quote: "", source_url: "", confidence: 0.5, verified: false, review_flag: true },
        { requirement: "C", applies: "yes", trigger: "", project_fact: "", citation: "", quote: "", source_url: "", confidence: 0.8, verified: true, review_flag: false },
      ] as Determination[],
      verification_verdicts: [
        { hypothesis_id: "h1", verdict: "fail", checks: {}, confidence: 0.2, repair_tickets: [{ ticket_id: "t1" } as RepairTicket] },
        { hypothesis_id: "h1", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: [] },
      ] as VerificationVerdict[],
      repair_tickets: [{ ticket_id: "t1" } as RepairTicket],
      coverage_family_statuses: [
        { id: "c1", family: "stormwater", status: "blocked_missing_fact", reason: "", project_facts_considered: [], missing_facts: ["disturbance_acres"] },
      ],
    });

    const counts = getVerificationCounts(run);
    expect(counts.verified).toBe(2);
    expect(counts.needs_review).toBe(1);
    expect(counts.failed_open).toBe(0);
    expect(counts.repairs_ran).toBe(1);
    expect(counts.blocked).toBe(1);
  });
});

describe("getRepairHistory", () => {
  it("returns chronological attempts for a hypothesis with one repair", () => {
    const run = makeRun({
      verification_verdicts: [
        { hypothesis_id: "hmbp", verdict: "fail", checks: { claim_too_broad: { pass: false, reason: "Quote only addresses threshold qty" } }, confidence: 0.2, repair_tickets: [{ ticket_id: "t1", hypothesis_id: "hmbp", failure_type: "grounding_failed", failed_check: "claim_too_broad", observed_problem: "claim is overbroad", repair_action: "Re-extract with 55 gal threshold", max_attempts_remaining: 1 }] },
      ] as VerificationVerdict[],
      repair_tickets: [
        { ticket_id: "t1", hypothesis_id: "hmbp", failure_type: "grounding_failed", failed_check: "claim_too_broad", observed_problem: "claim is overbroad", repair_action: "Re-extract with 55 gal threshold", max_attempts_remaining: 1 },
      ],
      evidence_bundles: [
        { hypothesis_id: "hmbp", sources: [{ url: "u", source_name: "n", authority_rank: 1, fetched_at: "", content_hash: "", effective_date: null, quote: "Businesses storing >= 55 gal..." }], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
      ] as EvidenceBundle[],
    });

    const history = getRepairHistory(run, "hmbp");
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].verdict).toBe("fail");
    expect(history[0].failed_check).toBe("claim_too_broad");
  });

  it("returns empty array when no repair", () => {
    expect(getRepairHistory(makeRun(), "nope")).toEqual([]);
  });
});

describe("isHypothesisVisible", () => {
  it("returns true when a triggering trace event has been replayed", () => {
    const run = makeRun({
      trace_events: [
        { id: "e1", run_id: "r", ts: "1", actor: "orchestrator", phase: "task_graph", status: "done", message: "" },
      ],
    });
    expect(isHypothesisVisible(run, "h_any", new Set(["e1"]))).toBe(true);
  });
  it("returns false before task_graph event is replayed", () => {
    const run = makeRun({
      trace_events: [
        { id: "e1", run_id: "r", ts: "1", actor: "orchestrator", phase: "task_graph", status: "done", message: "" },
      ],
    });
    expect(isHypothesisVisible(run, "h_any", new Set())).toBe(false);
  });
});
```

- [ ] **Step 2: Confirm fail**

Run: `pnpm test -- selectors.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement selectors.ts**

```ts
import type { ResearchRun, VerificationVerdict } from "@/lib/research/types";

export type VerificationCounts = {
  verified: number;
  needs_review: number;
  failed_open: number;   // failed with no subsequent pass
  repairs_ran: number;
  blocked: number;
};

export function getVerificationCounts(run: ResearchRun): VerificationCounts {
  const verified = run.determinations.filter((d) => d.verified).length;
  const needs_review = run.determinations.filter((d) => d.review_flag).length;

  // Group verdicts by hypothesis_id, take the last one chronologically (assume input order is chronological)
  const lastByHyp = new Map<string, VerificationVerdict>();
  for (const v of run.verification_verdicts) lastByHyp.set(v.hypothesis_id, v);
  const failed_open = [...lastByHyp.values()].filter((v) => v.verdict === "fail").length;

  const repairs_ran = run.repair_tickets.length;
  const blocked = run.coverage_family_statuses.filter((c) => c.status === "blocked_missing_fact").length;

  return { verified, needs_review, failed_open, repairs_ran, blocked };
}

export type RepairAttempt = {
  attempt: number;
  verdict: "pass" | "fail" | "needs_review";
  failed_check?: string;
  failure_reason?: string;
  repair_action?: string;
  quote?: string;
};

export function getRepairHistory(run: ResearchRun, hypothesisId: string): RepairAttempt[] {
  const verdicts = run.verification_verdicts.filter((v) => v.hypothesis_id === hypothesisId);
  if (verdicts.length === 0) return [];
  const tickets = run.repair_tickets.filter((t) => t.hypothesis_id === hypothesisId);
  const bundles = run.evidence_bundles.filter((b) => b.hypothesis_id === hypothesisId);

  return verdicts.map((v, i) => {
    const failedCheck = Object.entries(v.checks).find(([, c]) => !c.pass);
    const ticket = tickets[i];
    const bundle = bundles[i] ?? bundles[bundles.length - 1];
    return {
      attempt: i + 1,
      verdict: v.verdict,
      failed_check: failedCheck?.[0],
      failure_reason: failedCheck?.[1]?.reason,
      repair_action: ticket?.repair_action,
      quote: bundle?.sources[0]?.quote,
    };
  });
}

export function isHypothesisVisible(run: ResearchRun, _hypothesisId: string, replayedIds: Set<string>): boolean {
  // Hypotheses become visible once the task_graph trace event has been replayed.
  const trigger = run.trace_events.find((e) => e.phase === "task_graph" && e.status === "done");
  if (!trigger) return false;
  return replayedIds.has(trigger.id);
}

export function isCoverageVisible(run: ResearchRun, replayedIds: Set<string>): boolean {
  const trigger = run.trace_events.find((e) => e.phase === "coverage" && e.status === "done");
  if (!trigger) return false;
  return replayedIds.has(trigger.id);
}

export type HypothesisVisualState = "pending" | "running" | "verified" | "failed" | "repairing";

export function getHypothesisState(
  run: ResearchRun,
  hypothesisId: string,
  replayedIds: Set<string>,
): HypothesisVisualState {
  // Look at trace events about this hypothesis in chronological order
  const events = run.trace_events.filter((e) => e.artifact_id === hypothesisId && replayedIds.has(e.id));
  if (events.length === 0) {
    // fanout running implies all hypotheses are "running"
    const fanout = run.trace_events.find((e) => e.actor === "research_pool" && e.phase === "fanout" && e.status === "running");
    if (fanout && replayedIds.has(fanout.id)) {
      const fanoutDone = run.trace_events.find((e) => e.actor === "research_pool" && e.phase === "fanout" && e.status === "done");
      if (!fanoutDone || !replayedIds.has(fanoutDone.id)) return "running";
      // fanout done: tentatively verified until verifier says otherwise
      return "verified";
    }
    return "pending";
  }
  const last = events[events.length - 1];
  if (last.phase === "verification" && last.status === "failed") return "failed";
  if (last.phase === "repair_ticket") return "repairing";
  if (last.phase === "repair_verification" && last.status === "done") return "verified";
  if (last.phase === "repair_verification" && last.status === "needs_review") return "failed";
  return "verified";
}
```

- [ ] **Step 4: Confirm pass**

Run: `pnpm test -- selectors.test`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/selectors.ts src/lib/ui/__tests__/selectors.test.ts
git commit -m "feat(ui): selectors for verification counts, repair history, visibility"
```

---

### Task 4: graphLayout (pure)

**Files:**
- Create: `src/lib/ui/graphLayout.ts`
- Create: `src/lib/ui/__tests__/graphLayout.test.ts`

- [ ] **Step 1: Write failing test**

`src/lib/ui/__tests__/graphLayout.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { ResearchRun } from "@/lib/research/types";
import { buildGraph } from "../graphLayout";

const minimalRun: ResearchRun = {
  run_id: "t",
  status: "done",
  project_facts: {},
  jurisdiction_stack: [],
  scope_pack: {} as never,
  coverage_family_statuses: [
    { id: "cov_hmbp", family: "hazmat", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
  ],
  regulatory_angles: [
    { id: "ang_hmbp_55", family: "hazmat", label: "55gal threshold", reason: "", triggering_facts: [], status: "active" },
  ],
  research_graph: [
    { id: "hyp_hmbp", angle_id: "ang_hmbp_55", family: "hazmat", question: "Does 60gal trigger HMBP?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
  ],
  research_tasks: [
    { task_id: "task_1", hypothesis_id: "hyp_hmbp", assigned_agent: "a", allowed_tools: [], blocked_tools: [], budget: { max_sources: 1, max_runtime_seconds: 1, max_model_calls: 1 } },
  ],
  evidence_bundles: [],
  verification_verdicts: [],
  repair_tickets: [],
  memory_updates: [],
  determinations: [],
  trace_events: [
    { id: "ev_cov", run_id: "t", ts: "1", actor: "orchestrator", phase: "coverage", status: "done", message: "" },
    { id: "ev_tg", run_id: "t", ts: "2", actor: "orchestrator", phase: "task_graph", status: "done", message: "" },
  ],
  report_markdown: "",
};

describe("buildGraph", () => {
  it("returns no nodes when nothing has been replayed yet", () => {
    const { nodes, edges } = buildGraph(minimalRun, new Set());
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it("returns only coverage nodes after coverage event replayed", () => {
    const { nodes, edges } = buildGraph(minimalRun, new Set(["ev_cov"]));
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("coverage");
    expect(edges).toHaveLength(0);
  });

  it("returns coverage + angle + hypothesis + task after task_graph event replayed", () => {
    const { nodes, edges } = buildGraph(minimalRun, new Set(["ev_cov", "ev_tg"]));
    expect(nodes.map((n) => n.type).sort()).toEqual(["angle", "coverage", "hypothesis", "task"]);
    expect(edges).toHaveLength(3);
  });

  it("assigns x/y positions via dagre", () => {
    const { nodes } = buildGraph(minimalRun, new Set(["ev_cov", "ev_tg"]));
    for (const n of nodes) {
      expect(typeof n.position.x).toBe("number");
      expect(typeof n.position.y).toBe("number");
    }
  });
});
```

- [ ] **Step 2: Confirm fail**

Run: `pnpm test -- graphLayout.test`
Expected: FAIL.

- [ ] **Step 3: Implement graphLayout.ts**

```ts
import dagre from "dagre";
import type { ResearchRun } from "@/lib/research/types";
import { isCoverageVisible, isHypothesisVisible, getHypothesisState } from "./selectors";

export type FlowNode = {
  id: string;
  type: "coverage" | "angle" | "hypothesis" | "task";
  position: { x: number; y: number };
  data: {
    label: string;
    status: string;
    family?: string;
    hypothesisId?: string;
  };
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
};

const NODE_W = 180;
const NODE_H = 60;

export function buildGraph(run: ResearchRun, replayedIds: Set<string>): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  const coverageVisible = isCoverageVisible(run, replayedIds);
  const hypothesesVisible = isHypothesisVisible(run, "*", replayedIds);

  if (!coverageVisible) return { nodes: [], edges: [] };

  for (const cov of run.coverage_family_statuses) {
    if (cov.status === "out_of_scope") continue;
    nodes.push({
      id: cov.id,
      type: "coverage",
      position: { x: 0, y: 0 },
      data: {
        label: prettyFamily(cov.family),
        status: cov.status === "blocked_missing_fact" ? "blocked" : "verified",
        family: cov.family,
      },
    });
  }

  if (hypothesesVisible) {
    for (const angle of run.regulatory_angles) {
      nodes.push({
        id: angle.id,
        type: "angle",
        position: { x: 0, y: 0 },
        data: { label: angle.label, status: "verified", family: angle.family },
      });
      edges.push({ id: `e_${angle.family}_${angle.id}`, source: `cov_${angle.family}`, target: angle.id });
      // also try matching coverage node id directly (we don't know naming convention so try both)
      const cov = run.coverage_family_statuses.find((c) => c.family === angle.family);
      if (cov && cov.id !== `cov_${angle.family}`) {
        // replace the previous edge
        edges.pop();
        edges.push({ id: `e_${cov.id}_${angle.id}`, source: cov.id, target: angle.id });
      }
    }
    for (const hyp of run.research_graph) {
      const state = getHypothesisState(run, hyp.id, replayedIds);
      nodes.push({
        id: hyp.id,
        type: "hypothesis",
        position: { x: 0, y: 0 },
        data: { label: truncate(hyp.question, 60), status: state, family: hyp.family, hypothesisId: hyp.id },
      });
      edges.push({ id: `e_${hyp.angle_id}_${hyp.id}`, source: hyp.angle_id, target: hyp.id });
    }
    for (const task of run.research_tasks) {
      nodes.push({
        id: task.task_id,
        type: "task",
        position: { x: 0, y: 0 },
        data: { label: task.assigned_agent, status: "verified", hypothesisId: task.hypothesis_id },
      });
      edges.push({ id: `e_${task.hypothesis_id}_${task.task_id}`, source: task.hypothesis_id, target: task.task_id });
    }
  }

  layout(nodes, edges);
  return { nodes, edges };
}

function layout(nodes: FlowNode[], edges: FlowEdge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) {
    if (nodes.find((n) => n.id === e.source) && nodes.find((n) => n.id === e.target)) {
      g.setEdge(e.source, e.target);
    }
  }
  dagre.layout(g);
  for (const n of nodes) {
    const pos = g.node(n.id);
    if (pos) n.position = { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 };
  }
}

function prettyFamily(f: string) {
  return f.toUpperCase().replace(/_/g, " ");
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
```

- [ ] **Step 4: Confirm pass**

Run: `pnpm test -- graphLayout.test`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/graphLayout.ts src/lib/ui/__tests__/graphLayout.test.ts
git commit -m "feat(ui): graphLayout builds dagre-positioned React Flow nodes"
```

---

### Task 5: Zustand store

**Files:**
- Create: `src/lib/ui/store.ts`
- Create: `src/lib/ui/__tests__/store.test.ts`

- [ ] **Step 1: Write failing test**

`src/lib/ui/__tests__/store.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../store";

describe("store", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("starts in empty state", () => {
    const s = useStore.getState();
    expect(s.run).toBeNull();
    expect(s.replayedEventIds.size).toBe(0);
    expect(s.replayDone).toBe(false);
    expect(s.selectedHypothesisId).toBeNull();
  });

  it("tickReplay adds id and finishReplay flips replayDone", () => {
    const s = useStore.getState();
    s.tickReplay("e1");
    s.tickReplay("e2");
    expect(useStore.getState().replayedEventIds.has("e1")).toBe(true);
    expect(useStore.getState().replayedEventIds.has("e2")).toBe(true);
    s.finishReplay();
    expect(useStore.getState().replayDone).toBe(true);
  });

  it("select sets selected and opens drawer when replayDone", () => {
    const s = useStore.getState();
    s.finishReplay();
    s.select("hyp_x");
    expect(useStore.getState().selectedHypothesisId).toBe("hyp_x");
    expect(useStore.getState().drawerOpen).toBe(true);
  });

  it("select does not open drawer during replay", () => {
    const s = useStore.getState();
    s.select("hyp_x");
    expect(useStore.getState().selectedHypothesisId).toBe("hyp_x");
    expect(useStore.getState().drawerOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Confirm fail**

Run: `pnpm test -- store.test`
Expected: FAIL.

- [ ] **Step 3: Implement store.ts**

```ts
import { create } from "zustand";
import type { ResearchRun, ResearchRunInput } from "@/lib/research/types";

export type ReplaySpeed = 1 | 2;

export type Store = {
  run: ResearchRun | null;
  isRunning: boolean;
  runError: string | null;
  replayedEventIds: Set<string>;
  replayDone: boolean;
  selectedHypothesisId: string | null;
  drawerOpen: boolean;
  replaySpeed: ReplaySpeed;
  matrixFilter: "all" | "verified" | "needs_review" | "failed" | "blocked";
  startRun: (payload: ResearchRunInput) => Promise<void>;
  tickReplay: (eventId: string) => void;
  finishReplay: () => void;
  select: (id: string | null) => void;
  setDrawerOpen: (open: boolean) => void;
  setSpeed: (s: ReplaySpeed) => void;
  setMatrixFilter: (f: Store["matrixFilter"]) => void;
  reset: () => void;
};

const initial = {
  run: null,
  isRunning: false,
  runError: null,
  replayedEventIds: new Set<string>(),
  replayDone: false,
  selectedHypothesisId: null,
  drawerOpen: false,
  replaySpeed: 1 as ReplaySpeed,
  matrixFilter: "all" as const,
};

export const useStore = create<Store>((set, get) => ({
  ...initial,
  startRun: async (payload) => {
    set({ ...initial, isRunning: true });
    try {
      const res = await fetch("/api/research/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Run failed: HTTP ${res.status}`);
      const run = (await res.json()) as ResearchRun;
      set({ run, isRunning: false });
    } catch (e) {
      set({ isRunning: false, runError: e instanceof Error ? e.message : String(e) });
    }
  },
  tickReplay: (eventId) => {
    const next = new Set(get().replayedEventIds);
    next.add(eventId);
    set({ replayedEventIds: next });
  },
  finishReplay: () => set({ replayDone: true }),
  select: (id) => set({ selectedHypothesisId: id, drawerOpen: id !== null && get().replayDone }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setSpeed: (replaySpeed) => set({ replaySpeed }),
  setMatrixFilter: (matrixFilter) => set({ matrixFilter }),
  reset: () => set({ ...initial, replayedEventIds: new Set() }),
}));
```

- [ ] **Step 4: Confirm pass**

Run: `pnpm test -- store.test`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/store.ts src/lib/ui/__tests__/store.test.ts
git commit -m "feat(ui): Zustand store for run + replay + selection"
```

---

### Task 6: useReplay hook (with fake timers)

**Files:**
- Create: `src/lib/ui/useReplay.ts`
- Create: `src/lib/ui/__tests__/useReplay.test.tsx`

- [ ] **Step 1: Write failing test**

`src/lib/ui/__tests__/useReplay.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStore } from "../store";
import { useReplay } from "../useReplay";
import type { ResearchRun } from "@/lib/research/types";

const events: ResearchRun["trace_events"] = [
  { id: "e1", run_id: "r", ts: "2026-01-01T00:00:00.000Z", actor: "scope_agent", phase: "scope", status: "running", message: "" },
  { id: "e2", run_id: "r", ts: "2026-01-01T00:00:00.400Z", actor: "scope_agent", phase: "scope", status: "done", message: "" },
  { id: "e3", run_id: "r", ts: "2026-01-01T00:00:00.800Z", actor: "orchestrator", phase: "coverage", status: "done", message: "" },
];

function makeRun(): ResearchRun {
  return {
    run_id: "r", status: "done", project_facts: {}, jurisdiction_stack: [],
    scope_pack: {} as never, coverage_family_statuses: [], regulatory_angles: [],
    research_graph: [], research_tasks: [], evidence_bundles: [], verification_verdicts: [],
    repair_tickets: [], memory_updates: [], determinations: [], trace_events: events,
    report_markdown: "",
  };
}

describe("useReplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStore.getState().reset();
  });

  it("does nothing when run is null", () => {
    renderHook(() => useReplay());
    expect(useStore.getState().replayedEventIds.size).toBe(0);
  });

  it("ticks events in order and finishes", async () => {
    useStore.setState({ run: makeRun() });
    renderHook(() => useReplay());

    act(() => { vi.advanceTimersByTime(50); });
    expect(useStore.getState().replayedEventIds.has("e1")).toBe(true);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(useStore.getState().replayedEventIds.has("e2")).toBe(true);
    expect(useStore.getState().replayedEventIds.has("e3")).toBe(true);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(useStore.getState().replayDone).toBe(true);
  });
});
```

- [ ] **Step 2: Confirm fail**

Run: `pnpm test -- useReplay.test`
Expected: FAIL.

- [ ] **Step 3: Implement useReplay.ts**

```ts
import { useEffect, useRef } from "react";
import { useStore } from "./store";

// Delay between consecutive events, in ms (sums to ~6s for the seeded scenarios).
const DELAYS_MS: Record<string, number> = {
  "scope_agent/scope/running": 0,
  "scope_agent/scope/done": 400,
  "orchestrator/coverage/done": 400,
  "orchestrator/task_graph/done": 600,
  "research_pool/fanout/running": 300,
  "research_pool/fanout/done": 1200,
  "verifier/verification/failed": 500,
  "orchestrator/repair_ticket/queued": 600,
  "verifier/repair_verification/done": 1500,
  "verifier/repair_verification/needs_review": 1500,
  "synthesis_agent/matrix/done": 500,
};
const DEFAULT_DELAY = 300;

function delayFor(actor: string, phase: string, status: string) {
  return DELAYS_MS[`${actor}/${phase}/${status}`] ?? DEFAULT_DELAY;
}

export function useReplay() {
  const run = useStore((s) => s.run);
  const speed = useStore((s) => s.replaySpeed);
  const tickReplay = useStore((s) => s.tickReplay);
  const finishReplay = useStore((s) => s.finishReplay);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!run) return;
    cancelRef.current = false;
    const events = [...run.trace_events].sort((a, b) => a.ts.localeCompare(b.ts));
    let acc = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const ev of events) {
      acc += delayFor(ev.actor, ev.phase, ev.status) / speed;
      const t = setTimeout(() => {
        if (cancelRef.current) return;
        tickReplay(ev.id);
      }, acc);
      timers.push(t);
    }
    const done = setTimeout(() => {
      if (!cancelRef.current) finishReplay();
    }, acc + 200);
    timers.push(done);
    return () => {
      cancelRef.current = true;
      timers.forEach(clearTimeout);
    };
  }, [run, speed, tickReplay, finishReplay]);
}

export function skipReplay() {
  const { run, tickReplay, finishReplay } = useStore.getState();
  if (!run) return;
  for (const ev of run.trace_events) tickReplay(ev.id);
  finishReplay();
}
```

- [ ] **Step 4: Confirm pass**

Run: `pnpm test -- useReplay.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/useReplay.ts src/lib/ui/__tests__/useReplay.test.tsx
git commit -m "feat(ui): useReplay hook walks trace events on a timer"
```

---

### Task 7: Page shell + Header + InputPanel + ScenarioButtons

**Files:**
- Modify: `app/page.tsx`
- Create: `app/components/Header.tsx`
- Create: `app/components/InputPanel.tsx`
- Create: `app/components/ScenarioButtons.tsx`
- Create: `app/components/MissingFactsCard.tsx`
- Create: `app/components/JurisdictionStack.tsx`

- [ ] **Step 1: Create Header.tsx**

```tsx
"use client";
import { useStore } from "@/lib/ui/store";

export function Header() {
  const run = useStore((s) => s.run);
  const reset = useStore((s) => s.reset);
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--panel)" }}>
      <div style={{ fontWeight: 600 }}>PermitPilot · Truth Engine</div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12, color: "var(--text-dim)" }}>
        {run && <span>run: <code>{run.run_id}</code></span>}
        {run && <span>status: <b style={{ color: run.status === "done" ? "var(--green)" : "var(--yellow)" }}>{run.status}</b></span>}
        <button onClick={reset} style={{ padding: "4px 10px", background: "transparent", color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>Reset</button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create ScenarioButtons.tsx**

```tsx
"use client";
import { SCENARIOS } from "@/lib/ui/scenarios";
import { useStore } from "@/lib/ui/store";

export function ScenarioButtons() {
  const startRun = useStore((s) => s.startRun);
  const isRunning = useStore((s) => s.isRunning);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>Sample scenarios</div>
      {SCENARIOS.map((s) => (
        <button
          key={s.id}
          disabled={isRunning}
          onClick={() => startRun(s.payload)}
          style={{
            padding: "10px 12px",
            background: "var(--panel-2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            textAlign: "left",
            cursor: isRunning ? "wait" : "pointer",
          }}
        >
          <div style={{ fontWeight: 600 }}>{s.label}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{s.subtitle}</div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create MissingFactsCard.tsx**

```tsx
"use client";
import { useStore } from "@/lib/ui/store";

export function MissingFactsCard() {
  const run = useStore((s) => s.run);
  const missing = run?.scope_pack?.missing_facts ?? [];
  if (missing.length === 0) return null;
  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8 }}>Missing facts ({missing.length})</div>
      {missing.map((m) => (
        <div key={m.field} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "var(--yellow)" }}>⚠ {m.field}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{m.why_needed}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Blocks: {m.blocks.join(", ")}</div>
          <input disabled placeholder="Provide value (v2)" title="v2 feature" style={{ marginTop: 4, width: "100%", padding: "4px 6px", background: "var(--bg)", color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create JurisdictionStack.tsx**

```tsx
"use client";
import { useStore } from "@/lib/ui/store";

export function JurisdictionStack() {
  const stack = useStore((s) => s.run?.jurisdiction_stack ?? []);
  if (stack.length === 0) return null;
  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8 }}>Jurisdiction stack</div>
      {stack.map((j) => (
        <div key={j} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px dashed var(--border)" }}>{j}</div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create InputPanel.tsx**

```tsx
"use client";
import { useState } from "react";
import { ScenarioButtons } from "./ScenarioButtons";
import { MissingFactsCard } from "./MissingFactsCard";
import { JurisdictionStack } from "./JurisdictionStack";
import { useStore } from "@/lib/ui/store";

export function InputPanel() {
  const [text, setText] = useState("");
  const startRun = useStore((s) => s.startRun);
  const isRunning = useStore((s) => s.isRunning);
  const error = useStore((s) => s.runError);
  return (
    <aside style={{ width: 320, padding: 16, borderRight: "1px solid var(--border)", background: "var(--panel)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <ScenarioButtons />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>Or describe a project</div>
        <textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe your project change…"
          style={{ width: "100%", padding: 10, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, resize: "vertical", fontFamily: "inherit", fontSize: 12 }}
        />
        <button
          disabled={isRunning || !text.trim()}
          onClick={() => startRun({ project_description: text, demo_documents: [] })}
          style={{ padding: "8px 14px", background: "var(--accent)", color: "white", border: 0, borderRadius: 8, cursor: isRunning ? "wait" : "pointer", fontWeight: 600 }}
        >
          {isRunning ? "Running…" : "Run"}
        </button>
      </div>
      {error && <div style={{ padding: 10, background: "rgba(239,90,111,0.12)", border: "1px solid var(--red)", borderRadius: 8, fontSize: 12, color: "var(--red)" }}>{error}</div>}
      <JurisdictionStack />
      <MissingFactsCard />
    </aside>
  );
}
```

- [ ] **Step 6: Replace app/page.tsx**

```tsx
"use client";
import { Header } from "./components/Header";
import { InputPanel } from "./components/InputPanel";

export default function Page() {
  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", height: "100vh" }}>
      <Header />
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", overflow: "hidden" }}>
        <InputPanel />
        <main style={{ position: "relative", overflow: "hidden" }}>
          <div style={{ padding: 20, color: "var(--text-dim)" }}>(graph stage — Task 8)</div>
        </main>
        <aside style={{ width: 360, borderLeft: "1px solid var(--border)", background: "var(--panel)" }}>
          <div style={{ padding: 20, color: "var(--text-dim)" }}>(side panel — Task 9)</div>
        </aside>
      </div>
      <section style={{ borderTop: "1px solid var(--border)", background: "var(--panel)", maxHeight: 320, overflow: "auto" }}>
        <div style={{ padding: 20, color: "var(--text-dim)" }}>(bottom panel — Task 10)</div>
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx app/components/Header.tsx app/components/InputPanel.tsx app/components/ScenarioButtons.tsx app/components/MissingFactsCard.tsx app/components/JurisdictionStack.tsx
git commit -m "feat(ui): page shell + InputPanel with scenario buttons"
```

---

### Task 8: ResearchGraph + 4 node components

**Files:**
- Create: `app/components/ResearchGraph.tsx`
- Create: `app/components/ReplayControls.tsx`
- Create: `app/components/nodes/CoverageNode.tsx`
- Create: `app/components/nodes/AngleNode.tsx`
- Create: `app/components/nodes/HypothesisNode.tsx`
- Create: `app/components/nodes/TaskNode.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create the four node components**

`app/components/nodes/CoverageNode.tsx`:
```tsx
"use client";
import { Handle, Position } from "reactflow";

export function CoverageNode({ data }: { data: { label: string; status: string } }) {
  return (
    <div className="node" data-status={data.status} style={{ fontWeight: 600 }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>COVERAGE</div>
      <div>{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

`app/components/nodes/AngleNode.tsx`:
```tsx
"use client";
import { Handle, Position } from "reactflow";

export function AngleNode({ data }: { data: { label: string; status: string } }) {
  return (
    <div className="node" data-status={data.status}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>ANGLE</div>
      <div>{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

`app/components/nodes/HypothesisNode.tsx`:
```tsx
"use client";
import { Handle, Position } from "reactflow";

const ICONS: Record<string, string> = {
  pending: "·", running: "↻", verified: "✓", failed: "✗", repairing: "🔧", blocked: "🔒",
};

export function HypothesisNode({ data }: { data: { label: string; status: string } }) {
  return (
    <div className="node" data-status={data.status}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>HYPOTHESIS {ICONS[data.status] ?? ""}</div>
      <div style={{ fontSize: 11 }}>{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

`app/components/nodes/TaskNode.tsx`:
```tsx
"use client";
import { Handle, Position } from "reactflow";

export function TaskNode({ data }: { data: { label: string; status: string } }) {
  return (
    <div className="node" data-status={data.status} style={{ minWidth: 100, padding: "6px 10px" }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>TASK</div>
      <div style={{ fontSize: 11 }}>{data.label}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create ReplayControls.tsx**

```tsx
"use client";
import { useStore } from "@/lib/ui/store";
import { skipReplay } from "@/lib/ui/useReplay";

export function ReplayControls() {
  const speed = useStore((s) => s.replaySpeed);
  const setSpeed = useStore((s) => s.setSpeed);
  const replayDone = useStore((s) => s.replayDone);
  const run = useStore((s) => s.run);
  if (!run) return null;
  return (
    <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6, padding: 6, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, zIndex: 10 }}>
      {([1, 2] as const).map((s) => (
        <button key={s} onClick={() => setSpeed(s)} style={{ padding: "2px 8px", background: speed === s ? "var(--accent)" : "transparent", color: speed === s ? "white" : "var(--text-dim)", border: 0, borderRadius: 4, cursor: "pointer", fontSize: 11 }}>{s}×</button>
      ))}
      <button disabled={replayDone} onClick={skipReplay} style={{ padding: "2px 8px", background: "transparent", color: replayDone ? "var(--text-dim)" : "var(--text)", border: "1px solid var(--border)", borderRadius: 4, cursor: replayDone ? "default" : "pointer", fontSize: 11 }}>Skip</button>
    </div>
  );
}
```

- [ ] **Step 3: Create ResearchGraph.tsx**

```tsx
"use client";
import { useMemo } from "react";
import ReactFlow, { Background, Controls, type NodeTypes } from "reactflow";
import "reactflow/dist/style.css";
import { useStore } from "@/lib/ui/store";
import { buildGraph } from "@/lib/ui/graphLayout";
import { CoverageNode } from "./nodes/CoverageNode";
import { AngleNode } from "./nodes/AngleNode";
import { HypothesisNode } from "./nodes/HypothesisNode";
import { TaskNode } from "./nodes/TaskNode";
import { ReplayControls } from "./ReplayControls";

const nodeTypes: NodeTypes = {
  coverage: CoverageNode,
  angle: AngleNode,
  hypothesis: HypothesisNode,
  task: TaskNode,
};

export function ResearchGraph() {
  const run = useStore((s) => s.run);
  const replayedIds = useStore((s) => s.replayedEventIds);
  const select = useStore((s) => s.select);

  const { nodes, edges } = useMemo(() => {
    if (!run) return { nodes: [], edges: [] };
    return buildGraph(run, replayedIds);
  }, [run, replayedIds]);

  if (!run) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-dim)", padding: 20, textAlign: "center" }}>
        Pick a sample scenario or describe a project on the left.
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ReplayControls />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => {
          const hypId = (node.data as { hypothesisId?: string }).hypothesisId;
          if (hypId) select(hypId);
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background gap={20} color="#1f2330" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 4: Wire into page.tsx**

In `app/page.tsx`, replace the placeholder `<main>...</main>` with:
```tsx
import { ResearchGraph } from "./components/ResearchGraph";
import { useReplay } from "@/lib/ui/useReplay";
// ...inside Page():
useReplay();
// ...in JSX:
<main style={{ position: "relative", overflow: "hidden" }}>
  <ResearchGraph />
</main>
```

Full updated `app/page.tsx`:
```tsx
"use client";
import { Header } from "./components/Header";
import { InputPanel } from "./components/InputPanel";
import { ResearchGraph } from "./components/ResearchGraph";
import { useReplay } from "@/lib/ui/useReplay";

export default function Page() {
  useReplay();
  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", height: "100vh" }}>
      <Header />
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", overflow: "hidden" }}>
        <InputPanel />
        <main style={{ position: "relative", overflow: "hidden" }}>
          <ResearchGraph />
        </main>
        <aside style={{ width: 360, borderLeft: "1px solid var(--border)", background: "var(--panel)" }}>
          <div style={{ padding: 20, color: "var(--text-dim)" }}>(side panel — Task 9)</div>
        </aside>
      </div>
      <section style={{ borderTop: "1px solid var(--border)", background: "var(--panel)", maxHeight: 320, overflow: "auto" }}>
        <div style={{ padding: 20, color: "var(--text-dim)" }}>(bottom panel — Task 10)</div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/components/ResearchGraph.tsx app/components/ReplayControls.tsx app/components/nodes app/page.tsx
git commit -m "feat(ui): ResearchGraph with 4 React Flow node types"
```

---

### Task 9: SidePanel components

**Files:**
- Create: `app/components/SidePanel.tsx`
- Create: `app/components/VerificationSummary.tsx`
- Create: `app/components/CoverageFamilyList.tsx`
- Create: `app/components/RepairTicketsCard.tsx`
- Create: `app/components/TraceStream.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create VerificationSummary.tsx**

```tsx
"use client";
import { useStore } from "@/lib/ui/store";
import { getVerificationCounts } from "@/lib/ui/selectors";

export function VerificationSummary() {
  const run = useStore((s) => s.run);
  const setFilter = useStore((s) => s.setMatrixFilter);
  const filter = useStore((s) => s.matrixFilter);
  if (!run) return null;
  const c = getVerificationCounts(run);
  const rows: Array<[label: string, count: string, color: string, key: typeof filter]> = [
    ["✓ Verified", `${c.verified}`, "var(--green)", "verified"],
    ["⚠ Needs Review", `${c.needs_review}`, "var(--yellow)", "needs_review"],
    ["✗ Failed (open)", c.repairs_ran > 0 ? `${c.failed_open} / was ${c.repairs_ran}` : `${c.failed_open}`, "var(--red)", "failed"],
    ["🔧 Repairs ran", `${c.repairs_ran}`, "var(--orange)", "all"],
    ["🔒 Blocked", `${c.blocked}`, "var(--gray)", "blocked"],
  ];
  return (
    <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8 }}>Verification</div>
      {rows.map(([label, count, color, key]) => (
        <button
          key={label}
          onClick={() => setFilter(key)}
          style={{
            display: "flex", justifyContent: "space-between", width: "100%",
            padding: "6px 8px", marginBottom: 2, background: filter === key ? "var(--panel-2)" : "transparent",
            color: "var(--text)", border: 0, borderRadius: 4, cursor: "pointer", fontSize: 12,
          }}
        >
          <span style={{ color }}>{label}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{count}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create CoverageFamilyList.tsx**

```tsx
"use client";
import { useStore } from "@/lib/ui/store";

const COLORS: Record<string, string> = {
  active: "var(--green)",
  blocked_missing_fact: "var(--yellow)",
  out_of_scope: "var(--text-dim)",
  discovery_candidate: "var(--accent)",
};

export function CoverageFamilyList() {
  const run = useStore((s) => s.run);
  if (!run) return null;
  return (
    <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8 }}>Coverage families</div>
      {run.coverage_family_statuses.map((c) => (
        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
          <span>{c.family}</span>
          <span style={{ color: COLORS[c.status] ?? "var(--text-dim)", fontSize: 11 }}>{c.status.replace(/_/g, " ")}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create RepairTicketsCard.tsx**

```tsx
"use client";
import { useStore } from "@/lib/ui/store";

export function RepairTicketsCard() {
  const run = useStore((s) => s.run);
  const replayed = useStore((s) => s.replayedEventIds);
  if (!run || run.repair_tickets.length === 0) return null;
  return (
    <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8 }}>Repair tickets</div>
      {run.repair_tickets.map((t) => {
        const repairEvent = run.trace_events.find((e) => e.phase === "repair_verification" && e.artifact_id === t.hypothesis_id);
        const resolved = repairEvent ? replayed.has(repairEvent.id) : false;
        return (
          <div key={t.ticket_id} style={{ padding: 8, background: resolved ? "rgba(62,207,142,0.10)" : "rgba(245,158,11,0.10)", border: `1px solid ${resolved ? "var(--green)" : "var(--orange)"}`, borderRadius: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{t.hypothesis_id}</div>
            <div style={{ fontSize: 12, margin: "4px 0" }}>Observed: {t.observed_problem}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Action: {t.repair_action}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: resolved ? "var(--green)" : "var(--orange)" }}>{resolved ? "✓ resolved" : "🔧 repairing…"}</div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Create TraceStream.tsx**

```tsx
"use client";
import { useStore } from "@/lib/ui/store";

const STATUS_COLOR: Record<string, string> = {
  done: "var(--green)", running: "var(--accent)", failed: "var(--red)",
  needs_review: "var(--yellow)", queued: "var(--text-dim)",
};

export function TraceStream() {
  const run = useStore((s) => s.run);
  const replayed = useStore((s) => s.replayedEventIds);
  if (!run) return null;
  const events = [...run.trace_events].sort((a, b) => a.ts.localeCompare(b.ts)).filter((e) => replayed.has(e.id));
  return (
    <div style={{ padding: 12, flex: 1, overflowY: "auto" }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8 }}>Trace</div>
      {events.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>(waiting…)</div>}
      {events.map((e) => (
        <div key={e.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, padding: "4px 0", fontSize: 11, borderBottom: "1px dashed var(--border)" }}>
          <span style={{ color: STATUS_COLOR[e.status] ?? "var(--text-dim)", minWidth: 70 }}>{e.phase}</span>
          <span>{e.message}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create SidePanel.tsx**

```tsx
"use client";
import { VerificationSummary } from "./VerificationSummary";
import { CoverageFamilyList } from "./CoverageFamilyList";
import { RepairTicketsCard } from "./RepairTicketsCard";
import { TraceStream } from "./TraceStream";

export function SidePanel() {
  return (
    <aside style={{ width: 360, borderLeft: "1px solid var(--border)", background: "var(--panel)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <VerificationSummary />
      <CoverageFamilyList />
      <RepairTicketsCard />
      <TraceStream />
    </aside>
  );
}
```

- [ ] **Step 6: Wire into page.tsx**

Replace the `<aside>` placeholder with `<SidePanel />`:
```tsx
import { SidePanel } from "./components/SidePanel";
// ...
<SidePanel />
```

- [ ] **Step 7: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/components/SidePanel.tsx app/components/VerificationSummary.tsx app/components/CoverageFamilyList.tsx app/components/RepairTicketsCard.tsx app/components/TraceStream.tsx app/page.tsx
git commit -m "feat(ui): SidePanel with summary, coverage list, repairs, trace"
```

---

### Task 10: BottomPanel — Matrix + Drawer + Report

**Files:**
- Create: `app/components/BottomPanel.tsx`
- Create: `app/components/ApplicabilityMatrix.tsx`
- Create: `app/components/EvidenceDrawer.tsx`
- Create: `app/components/ReportTab.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create ApplicabilityMatrix.tsx**

```tsx
"use client";
import { useStore } from "@/lib/ui/store";

export function ApplicabilityMatrix() {
  const run = useStore((s) => s.run);
  const replayDone = useStore((s) => s.replayDone);
  const select = useStore((s) => s.select);
  const filter = useStore((s) => s.matrixFilter);

  if (!run) return <div style={{ padding: 12, color: "var(--text-dim)" }}>No run yet.</div>;
  if (!replayDone) return <div style={{ padding: 12, color: "var(--text-dim)" }}>Matrix builds when replay completes…</div>;

  const rows = run.determinations.filter((d) => {
    if (filter === "all") return true;
    if (filter === "verified") return d.verified;
    if (filter === "needs_review") return d.review_flag;
    if (filter === "failed") return !d.verified && !d.review_flag;
    return true;
  });
  if (rows.length === 0) return <div style={{ padding: 12, color: "var(--text-dim)" }}>No determinations — likely all coverage families blocked. See Missing Facts.</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "var(--panel-2)", textAlign: "left" }}>
            {["Requirement", "Applies", "Trigger", "Fact", "Citation", "Conf", "Verified"].map((h) => (
              <th key={h} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", color: "var(--text-dim)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => {
            const cls = d.verified ? "row-verified" : d.review_flag ? "row-needs-review" : "row-failed";
            const hypId = inferHypIdFromRequirement(d.requirement, run);
            return (
              <tr key={i} className={cls} onClick={() => hypId && select(hypId)} style={{ cursor: hypId ? "pointer" : "default" }}>
                <td style={{ padding: "8px 10px" }}>{d.requirement}</td>
                <td style={{ padding: "8px 10px" }}>{d.applies}</td>
                <td style={{ padding: "8px 10px", color: "var(--text-dim)" }}>{d.trigger}</td>
                <td style={{ padding: "8px 10px", color: "var(--text-dim)" }}>{d.project_fact}</td>
                <td style={{ padding: "8px 10px", color: "var(--text-dim)" }}>{d.citation}</td>
                <td style={{ padding: "8px 10px", fontVariantNumeric: "tabular-nums" }}>{d.confidence.toFixed(2)}</td>
                <td style={{ padding: "8px 10px" }}>{d.verified ? "✓" : d.review_flag ? "⚠" : "✗"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function inferHypIdFromRequirement(req: string, run: { research_graph: { id: string; question: string }[] }) {
  const lower = req.toLowerCase();
  const hit = run.research_graph.find((h) => lower.includes(h.id.toLowerCase()) || h.question.toLowerCase().includes(lower.split(" ")[0]));
  return hit?.id ?? null;
}
```

- [ ] **Step 2: Create EvidenceDrawer.tsx**

```tsx
"use client";
import { useStore } from "@/lib/ui/store";
import { getRepairHistory } from "@/lib/ui/selectors";

export function EvidenceDrawer() {
  const run = useStore((s) => s.run);
  const open = useStore((s) => s.drawerOpen);
  const hypId = useStore((s) => s.selectedHypothesisId);
  const setOpen = useStore((s) => s.setDrawerOpen);
  if (!run || !open || !hypId) return null;
  const bundle = run.evidence_bundles.find((b) => b.hypothesis_id === hypId);
  const verdict = [...run.verification_verdicts].reverse().find((v) => v.hypothesis_id === hypId);
  const history = getRepairHistory(run, hypId);

  return (
    <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 420, background: "var(--panel)", borderLeft: "1px solid var(--border)", padding: 16, overflowY: "auto", zIndex: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>Evidence — {hypId}</div>
        <button onClick={() => setOpen(false)} style={{ background: "transparent", color: "var(--text-dim)", border: 0, cursor: "pointer", fontSize: 16 }}>×</button>
      </div>
      {history.length > 1 && (
        <details open style={{ marginBottom: 12, padding: 8, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 6 }}>
          <summary style={{ cursor: "pointer", fontSize: 12 }}>🔧 Repair history ({history.length} attempts)</summary>
          {history.map((h, i) => (
            <div key={i} style={{ marginTop: 8, paddingTop: 8, borderTop: i > 0 ? "1px dashed var(--border)" : 0 }}>
              <div style={{ fontSize: 12, color: h.verdict === "pass" ? "var(--green)" : "var(--red)" }}>Attempt {h.attempt} — {h.verdict.toUpperCase()}</div>
              {h.failed_check && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Failed check: {h.failed_check}</div>}
              {h.failure_reason && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Reason: {h.failure_reason}</div>}
              {h.repair_action && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Action: {h.repair_action}</div>}
              {h.quote && <blockquote style={{ margin: "4px 0", padding: "4px 8px", borderLeft: "2px solid var(--border)", fontSize: 11, fontStyle: "italic" }}>{h.quote}</blockquote>}
            </div>
          ))}
        </details>
      )}
      {bundle?.sources.map((s, i) => (
        <div key={i} style={{ marginBottom: 12, padding: 8, background: "var(--panel-2)", borderRadius: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{s.source_name}</div>
          <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--accent)" }}>{s.url}</a>
          <blockquote style={{ margin: "8px 0", padding: "6px 10px", borderLeft: "2px solid var(--accent)", fontSize: 12, fontStyle: "italic" }}>{s.quote}</blockquote>
          <div style={{ fontSize: 10, color: "var(--text-dim)" }}>fetched {s.fetched_at} · hash {s.content_hash.slice(0, 12)}</div>
        </div>
      ))}
      {verdict && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 4 }}>Verifier checks</div>
          {Object.entries(verdict.checks).map(([k, c]) => (
            <div key={k} style={{ fontSize: 11, padding: "2px 0" }}>
              <span style={{ color: c.pass ? "var(--green)" : "var(--red)" }}>{c.pass ? "✓" : "✗"}</span> {k}: <span style={{ color: "var(--text-dim)" }}>{c.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create ReportTab.tsx**

```tsx
"use client";
import { useStore } from "@/lib/ui/store";

export function ReportTab() {
  const md = useStore((s) => s.run?.report_markdown ?? "");
  if (!md) return <div style={{ padding: 12, color: "var(--text-dim)" }}>No report yet.</div>;
  return (
    <pre style={{ padding: 16, margin: 0, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 12, lineHeight: 1.5, color: "var(--text)" }}>{md}</pre>
  );
}
```

- [ ] **Step 4: Create BottomPanel.tsx (with tabs)**

```tsx
"use client";
import { useState } from "react";
import { ApplicabilityMatrix } from "./ApplicabilityMatrix";
import { ReportTab } from "./ReportTab";

export function BottomPanel() {
  const [tab, setTab] = useState<"matrix" | "report">("matrix");
  return (
    <section style={{ borderTop: "1px solid var(--border)", background: "var(--panel)", maxHeight: 320, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
        {(["matrix", "report"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 14px", background: tab === t ? "var(--panel-2)" : "transparent", color: "var(--text)", border: 0, borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent", cursor: "pointer", fontSize: 12, textTransform: "uppercase" }}>{t}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "matrix" ? <ApplicabilityMatrix /> : <ReportTab />}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire page.tsx — final layout**

Replace `app/page.tsx` with:
```tsx
"use client";
import { Header } from "./components/Header";
import { InputPanel } from "./components/InputPanel";
import { ResearchGraph } from "./components/ResearchGraph";
import { SidePanel } from "./components/SidePanel";
import { BottomPanel } from "./components/BottomPanel";
import { EvidenceDrawer } from "./components/EvidenceDrawer";
import { useReplay } from "@/lib/ui/useReplay";

export default function Page() {
  useReplay();
  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", height: "100vh" }}>
      <Header />
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", overflow: "hidden", position: "relative" }}>
        <InputPanel />
        <main style={{ position: "relative", overflow: "hidden" }}>
          <ResearchGraph />
        </main>
        <SidePanel />
        <EvidenceDrawer />
      </div>
      <BottomPanel />
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/components/BottomPanel.tsx app/components/ApplicabilityMatrix.tsx app/components/EvidenceDrawer.tsx app/components/ReportTab.tsx app/page.tsx
git commit -m "feat(ui): BottomPanel matrix + report + EvidenceDrawer"
```

---

### Task 11: HMBP scenario smoke test

**Files:**
- Create: `src/lib/ui/__tests__/scenarios.smoke.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { runResearch } from "@/lib/research/run";
import { SCENARIOS } from "../scenarios";

describe("scenario smoke", () => {
  it("complex scenario produces an HMBP repair that ends verified", async () => {
    const complex = SCENARIOS.find((s) => s.id === "complex")!;
    const run = await runResearch(complex.payload);
    expect(run.repair_tickets.length).toBeGreaterThan(0);
    const hmbp = run.determinations.find((d) => d.requirement.toLowerCase().includes("hmbp"));
    expect(hmbp, "HMBP determination must exist").toBeDefined();
    expect(hmbp!.verified, "HMBP must end verified after repair").toBe(true);
  });

  it("simple construction scenario produces construction-stormwater determination", async () => {
    const simple = SCENARIOS.find((s) => s.id === "simple")!;
    const run = await runResearch(simple.payload);
    const sw = run.determinations.find((d) => d.requirement.toLowerCase().includes("stormwater") || d.requirement.toLowerCase().includes("construction"));
    expect(sw, "construction stormwater determination must exist").toBeDefined();
  });

  it("missing-facts scenario produces missing_facts entries", async () => {
    const m = SCENARIOS.find((s) => s.id === "missing")!;
    const run = await runResearch(m.payload);
    expect(run.scope_pack.missing_facts.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, confirm pass**

Run: `pnpm test -- scenarios.smoke.test`
Expected: PASS. If the HMBP assertion fails, the scenario string needs another trigger word — debug `parseScope` and adjust.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ui/__tests__/scenarios.smoke.test.ts
git commit -m "test(ui): smoke test for HMBP repair demo moment"
```

---

### Task 12: EvidenceDrawer component smoke test

**Files:**
- Create: `app/components/__tests__/EvidenceDrawer.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceDrawer } from "../EvidenceDrawer";
import { useStore } from "@/lib/ui/store";
import type { ResearchRun } from "@/lib/research/types";

function makeRun(): ResearchRun {
  return {
    run_id: "r", status: "done", project_facts: {}, jurisdiction_stack: [],
    scope_pack: {} as never, coverage_family_statuses: [], regulatory_angles: [],
    research_graph: [{ id: "hmbp", angle_id: "a", family: "hazmat", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] }],
    research_tasks: [],
    evidence_bundles: [{ hypothesis_id: "hmbp", sources: [{ url: "https://example.org/x", source_name: "CA HSC", authority_rank: 1, fetched_at: "2026-01-01", content_hash: "abc123def456", effective_date: null, quote: "Businesses storing >= 55 gallons must file HMBP." }], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] }],
    verification_verdicts: [{ hypothesis_id: "hmbp", verdict: "pass", checks: { grounding: { pass: true, reason: "quote supports claim" } }, confidence: 0.9, repair_tickets: [] }],
    repair_tickets: [], memory_updates: [], determinations: [], trace_events: [], report_markdown: "",
  };
}

describe("EvidenceDrawer", () => {
  beforeEach(() => { useStore.getState().reset(); });

  it("renders nothing when closed", () => {
    useStore.setState({ run: makeRun(), selectedHypothesisId: "hmbp", drawerOpen: false });
    const { container } = render(<EvidenceDrawer />);
    expect(container.firstChild).toBeNull();
  });

  it("renders source quote when open", () => {
    useStore.setState({ run: makeRun(), selectedHypothesisId: "hmbp", drawerOpen: true });
    render(<EvidenceDrawer />);
    expect(screen.getByText(/Businesses storing/)).toBeInTheDocument();
    expect(screen.getByText("CA HSC")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, confirm pass**

Run: `pnpm test -- EvidenceDrawer.test`
Expected: PASS, 2/2.

- [ ] **Step 3: Commit**

```bash
git add app/components/__tests__/EvidenceDrawer.test.tsx
git commit -m "test(ui): EvidenceDrawer renders source quote"
```

---

### Task 13: Full verification pass

**Files:** none modified

- [ ] **Step 1: Run all checks**

```bash
cd "/Users/cyrusgu/Desktop/antler hackson/permitpilot"
pnpm typecheck
pnpm build
pnpm eval
pnpm test
```

Expected: all four green.

- [ ] **Step 2: Manual dev server smoke**

```bash
pnpm dev
```

Open `http://localhost:3000` and:
- Confirm empty state visible
- Click "Complex SoCal Manufacturing" — graph grows over ~6s, HMBP turns red, repair card appears, HMBP turns green, matrix populates
- Click HMBP graph node — drawer opens with quote + verifier checks + repair history
- Click "Simple Construction" — different graph, construction-stormwater verified row
- Click "Missing Facts" — Missing Facts card populates with disabled inputs; matrix mostly needs_review or empty
- Open browser console — no errors

If anything broken, file a bug and fix before declaring done.

- [ ] **Step 3: Final commit (only if changes were needed during smoke)**

```bash
git status
# if clean, skip commit; otherwise:
git add -A
git commit -m "fix(ui): final smoke fixes"
```

---

## Self-Review (Done)

- Spec coverage: all 11 spec sections map to tasks 1–13.
- No TBDs in step bodies (only in test description strings, intentional).
- Type consistency: `getVerificationCounts`, `getRepairHistory`, `buildGraph`, `useStore` signatures match across tasks.
- Spec timing math: replay sums to ~6s (matches updated spec).
