# Report View Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat BottomPanel (matrix table + raw markdown) with coverage-family cards, where clicking a card opens a frosted full-page overlay showing synthesis detail (left) and worker-discovered permit form (right).

**Architecture:** Extend the typed artifacts pipeline (`SourceFixture` -> `EvidenceBundle` -> `Determination`) with a `permit_filing` field that workers discover during research. A new `groupDeterminationsByFamily()` selector groups artifacts by coverage family for the cards grid. The overlay reads from Zustand store state (`reportFamily`) to show detail + permit panes.

**Tech Stack:** Next.js 15, React 19, Tailwind v4 (inline classes), Zustand, Vitest + React Testing Library

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/research/types.ts` | Add `permit_filing` to `SourceFixture`, `EvidenceBundle`, `Determination` |
| Modify | `src/lib/research/fixtures/sources.ts` | Add `permit_filing` data to all 9 fixtures |
| Modify | `src/lib/research/workers.ts` | Copy `permit_filing` from fixture into `EvidenceBundle` |
| Modify | `src/lib/research/synthesis.ts` | Carry `permit_filing` from evidence to `Determination` |
| Modify | `src/lib/ui/selectors.ts` | Add `FamilyReport` type and `groupDeterminationsByFamily()` |
| Modify | `src/lib/ui/store.ts` | Add `reportFamily` state, `openReport`/`closeReport` actions |
| Create | `app/components/ReportCards.tsx` | Cards grid grouped by coverage family |
| Create | `app/components/ReportOverlay.tsx` | Frosted full-page overlay container + close logic |
| Create | `app/components/SynthesisDetail.tsx` | Left pane: determination + evidence + checks + repair |
| Create | `app/components/PermitPane.tsx` | Right pane: permit PDF iframe / portal link with tabs |
| Modify | `app/page.tsx` | Replace `<BottomPanel />` with `<ReportCards />` + `<ReportOverlay />` |
| Remove | `app/components/BottomPanel.tsx` | Replaced by `ReportCards` |
| Remove | `app/components/ReportTab.tsx` | Raw markdown dump no longer needed |
| Create | `src/lib/ui/__tests__/groupDeterminationsByFamily.test.ts` | Tests for the new selector |
| Create | `src/lib/ui/__tests__/store-report.test.ts` | Tests for reportFamily store slice |
| Create | `app/components/__tests__/ReportCards.test.tsx` | Tests for cards grid rendering |
| Create | `app/components/__tests__/ReportOverlay.test.tsx` | Tests for overlay container + close |
| Create | `app/components/__tests__/SynthesisDetail.test.tsx` | Tests for left pane rendering |
| Create | `app/components/__tests__/PermitPane.test.tsx` | Tests for right pane rendering |

---

### Task 1: Add `permit_filing` to type definitions

**Files:**
- Modify: `src/lib/research/types.ts:98-109` (SourceFixture), `111-131` (EvidenceBundle), `149-162` (Determination)

- [ ] **Step 1: Add `permit_filing` type to `SourceFixture`**

In `src/lib/research/types.ts`, add the `permit_filing` optional field to the `SourceFixture` type after the `extracted` field (after line 109):

```ts
// In SourceFixture, after `extracted: Record<string, string | number | boolean | null>;`
permit_filing?: {
  form_name: string;
  form_url: string;
  agency: string;
  portal_url: string;
  instructions?: string;
};
```

- [ ] **Step 2: Add `permit_filing` type to `EvidenceBundle`**

In the same file, add the `permit_filing` optional field to `EvidenceBundle` after `uncertainties` (after line 131):

```ts
// In EvidenceBundle, after `uncertainties: string[];`
permit_filing?: {
  form_name: string;
  form_url: string;
  agency: string;
  portal_url: string;
  instructions?: string;
};
```

- [ ] **Step 3: Add `permit_filing` type to `Determination`**

In the same file, add the `permit_filing` optional field to `Determination` after `review_flag` (after line 162):

```ts
// In Determination, after `review_flag: boolean;`
permit_filing?: {
  form_name: string;
  form_url: string;
  agency: string;
  portal_url: string;
  instructions?: string;
};
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors. The new fields are all optional so existing code is unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/types.ts
git commit -m "feat(types): add permit_filing to SourceFixture, EvidenceBundle, Determination"
```

---

### Task 2: Add permit_filing data to source fixtures

**Files:**
- Modify: `src/lib/research/fixtures/sources.ts`

- [ ] **Step 1: Add `permit_filing` to `scaqmd_rule_201`**

In `src/lib/research/fixtures/sources.ts`, add after the `extracted` field of `scaqmd_rule_201`:

```ts
permit_filing: {
  form_name: "SCAQMD Permit to Construct Application",
  form_url: "https://www.aqmd.gov/home/permits/permit-applications",
  agency: "South Coast AQMD",
  portal_url: "https://www.aqmd.gov/home/permits",
  instructions: "Submit application through SCAQMD online portal or in person",
},
```

- [ ] **Step 2: Add `permit_filing` to `scaqmd_rule_219`**

```ts
permit_filing: {
  form_name: "SCAQMD Rule 219 Exemption Worksheet",
  form_url: "https://www.aqmd.gov/home/permits/permit-applications",
  agency: "South Coast AQMD",
  portal_url: "https://www.aqmd.gov/home/permits",
  instructions: "Complete exemption worksheet to document equipment qualifies under Rule 219",
},
```

- [ ] **Step 3: Add `permit_filing` to `scaqmd_rule_222`**

```ts
permit_filing: {
  form_name: "SCAQMD Rule 222 Registration",
  form_url: "https://www.aqmd.gov/home/permits/permit-applications",
  agency: "South Coast AQMD",
  portal_url: "https://www.aqmd.gov/home/permits",
  instructions: "File registration form for equipment category covered by Rule 222",
},
```

- [ ] **Step 4: Add `permit_filing` to `industrial_general_permit`**

```ts
permit_filing: {
  form_name: "SMARTS IGP Notice of Intent",
  form_url: "https://smarts.waterboards.ca.gov/",
  agency: "California Water Boards",
  portal_url: "https://smarts.waterboards.ca.gov/",
  instructions: "File NOI through SMARTS online portal",
},
```

- [ ] **Step 5: Add `permit_filing` to `construction_general_permit`**

```ts
permit_filing: {
  form_name: "SMARTS CGP Notice of Intent",
  form_url: "https://smarts.waterboards.ca.gov/",
  agency: "California Water Boards",
  portal_url: "https://smarts.waterboards.ca.gov/",
  instructions: "File NOI through SMARTS online portal before construction begins",
},
```

- [ ] **Step 6: Add `permit_filing` to `hmbp_threshold_bad`**

```ts
permit_filing: {
  form_name: "Hazardous Materials Business Plan (HMBP)",
  form_url: "https://cers.calepa.ca.gov/",
  agency: "CalEPA / Local CUPA",
  portal_url: "https://cers.calepa.ca.gov/",
  instructions: "Submit through CERS portal to your local Certified Unified Program Agency",
},
```

- [ ] **Step 7: Add `permit_filing` to `hmbp_threshold_repaired`**

```ts
permit_filing: {
  form_name: "Hazardous Materials Business Plan (HMBP)",
  form_url: "https://cers.calepa.ca.gov/",
  agency: "CalEPA / Local CUPA",
  portal_url: "https://cers.calepa.ca.gov/",
  instructions: "Submit through CERS portal to your local Certified Unified Program Agency",
},
```

- [ ] **Step 8: Add `permit_filing` to `hazardous_waste_generator`**

```ts
permit_filing: {
  form_name: "EPA Hazardous Waste Generator Registration",
  form_url: "https://hwts.dtsc.ca.gov/",
  agency: "EPA / DTSC",
  portal_url: "https://hwts.dtsc.ca.gov/",
  instructions: "Register through DTSC Hazardous Waste Tracking System",
},
```

- [ ] **Step 9: Add `permit_filing` to `wastewater_pretreatment`**

```ts
permit_filing: {
  form_name: "Industrial Wastewater Discharge Permit Application",
  form_url: "https://www.epa.gov/npdes/national-pretreatment-program",
  agency: "Local POTW",
  portal_url: "https://www.epa.gov/npdes/national-pretreatment-program",
  instructions: "Contact your local Publicly Owned Treatment Works for application forms",
},
```

- [ ] **Step 10: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors. All `permit_filing` objects match the `SourceFixture["permit_filing"]` type.

- [ ] **Step 11: Commit**

```bash
git add src/lib/research/fixtures/sources.ts
git commit -m "feat(fixtures): add permit_filing data to all 9 source fixtures"
```

---

### Task 3: Pipeline — workers copy `permit_filing` into `EvidenceBundle`

**Files:**
- Modify: `src/lib/research/workers.ts:38-62`

- [ ] **Step 1: Add `permit_filing` to the returned `EvidenceBundle` in `runResearchTask()`**

In `src/lib/research/workers.ts`, inside the `runResearchTask` function, add `permit_filing: fixture.permit_filing` to the returned object. The return statement (currently lines 38-63) becomes:

```ts
return {
  hypothesis_id: hypothesis.id,
  sources: [
    {
      url: fixture.url,
      source_name: fixture.source_name,
      authority_rank: fixture.authority_rank,
      fetched_at: fixture.fetched_at,
      content_hash: fixture.content_hash,
      effective_date: fixture.effective_date,
      quote: fixture.quote
    }
  ],
  extracted_claims: [
    {
      field: Object.keys(fixture.extracted)[0] ?? "source_claim",
      value: String(Object.values(fixture.extracted)[0] ?? hypothesis.claim_to_test ?? hypothesis.question),
      source_url: fixture.url,
      quote: fixture.quote,
      confidence: 0.82
    }
  ],
  researcher_conclusion: preliminaryConclusion(hypothesis.id),
  uncertainties: hypothesis.id === "H-WASTE-GENERATOR" ? ["Monthly hazardous waste quantity is missing."] : [],
  permit_filing: fixture.permit_filing,
};
```

The only change is adding `permit_filing: fixture.permit_filing,` at the end.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/research/workers.ts
git commit -m "feat(workers): copy permit_filing from fixture to EvidenceBundle"
```

---

### Task 4: Pipeline — synthesis carries `permit_filing` to `Determination`

**Files:**
- Modify: `src/lib/research/synthesis.ts:47-69`

- [ ] **Step 1: Add `permit_filing` to the `Determination` in `determinationFor()`**

In `src/lib/research/synthesis.ts`, in the `determinationFor()` function, add `permit_filing` to the returned object. Only include it when the verdict is "pass" (the determination is verified). The return statement becomes:

```ts
return {
  requirement: requirementFor(hypothesis.id),
  applies,
  trigger: hypothesis.question,
  project_fact: projectFactFor(scope, hypothesis.id, angleLabel),
  citation: source ? `${source.source_name}, fetched ${source.fetched_at.slice(0, 10)}` : "No supporting source verified",
  quote: source?.quote ?? verdict?.checks.predicate_math?.reason ?? "No quote available",
  source_url: source?.url ?? "",
  confidence: verdict?.confidence ?? 0.2,
  verified,
  review_flag: !verified,
  permit_filing: verified ? evidence?.permit_filing : undefined,
} satisfies Determination;
```

The only change is adding `permit_filing: verified ? evidence?.permit_filing : undefined,` before `} satisfies Determination`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run existing tests to check nothing broke**

Run: `pnpm test`
Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/research/synthesis.ts
git commit -m "feat(synthesis): carry permit_filing from evidence to Determination when verified"
```

---

### Task 5: New selector — `groupDeterminationsByFamily`

**Files:**
- Create: `src/lib/ui/__tests__/groupDeterminationsByFamily.test.ts`
- Modify: `src/lib/ui/selectors.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ui/__tests__/groupDeterminationsByFamily.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type {
  ResearchRun,
  ResearchHypothesis,
  Determination,
  EvidenceBundle,
  VerificationVerdict,
  CoverageFamilyStatus,
  RepairTicket,
} from "@/lib/research/types";
import { groupDeterminationsByFamily } from "../selectors";

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

describe("groupDeterminationsByFamily", () => {
  it("groups determinations by coverage family from research_graph", () => {
    const hypotheses: ResearchHypothesis[] = [
      { id: "H-AIR-201", angle_id: "a1", family: "air", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
      { id: "H-AIR-219", angle_id: "a1", family: "air", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
      { id: "H-HAZMAT-HMBP", angle_id: "a2", family: "hazmat", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
    ];
    const determinations: Determination[] = [
      { requirement: "SCAQMD 201", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.9, verified: true, review_flag: false },
      { requirement: "Rule 219", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.9, verified: true, review_flag: false },
      { requirement: "HMBP", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.9, verified: true, review_flag: false },
    ];
    const bundles: EvidenceBundle[] = [
      { hypothesis_id: "H-AIR-201", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
      { hypothesis_id: "H-AIR-219", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
      { hypothesis_id: "H-HAZMAT-HMBP", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
    ];
    const verdicts: VerificationVerdict[] = [
      { hypothesis_id: "H-AIR-201", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: [] },
      { hypothesis_id: "H-AIR-219", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: [] },
      { hypothesis_id: "H-HAZMAT-HMBP", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: [] },
    ];
    const familyStatuses: CoverageFamilyStatus[] = [
      { id: "cf-air", family: "air", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
      { id: "cf-hazmat", family: "hazmat", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
    ];

    const run = makeRun({
      research_graph: hypotheses,
      determinations,
      evidence_bundles: bundles,
      verification_verdicts: verdicts,
      coverage_family_statuses: familyStatuses,
    });

    const result = groupDeterminationsByFamily(run);

    expect(result.size).toBe(2);

    const air = result.get("air")!;
    expect(air).toBeDefined();
    expect(air.family).toBe("air");
    expect(air.determinations).toHaveLength(2);
    expect(air.evidenceBundles).toHaveLength(2);
    expect(air.verdicts).toHaveLength(2);

    const hazmat = result.get("hazmat")!;
    expect(hazmat).toBeDefined();
    expect(hazmat.family).toBe("hazmat");
    expect(hazmat.determinations).toHaveLength(1);
  });

  it("returns empty map when no hypotheses exist", () => {
    const result = groupDeterminationsByFamily(makeRun());
    expect(result.size).toBe(0);
  });

  it("includes repair tickets for the correct family", () => {
    const hypotheses: ResearchHypothesis[] = [
      { id: "H-HAZMAT-HMBP", angle_id: "a1", family: "hazmat", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
    ];
    const tickets: RepairTicket[] = [
      { ticket_id: "t1", hypothesis_id: "H-HAZMAT-HMBP", failure_type: "grounding_failed", failed_check: "claim_too_broad", observed_problem: "overbroad", repair_action: "re-extract", max_attempts_remaining: 1 },
    ];
    const run = makeRun({
      research_graph: hypotheses,
      determinations: [{ requirement: "HMBP", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.9, verified: true, review_flag: false }],
      evidence_bundles: [{ hypothesis_id: "H-HAZMAT-HMBP", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] }],
      verification_verdicts: [{ hypothesis_id: "H-HAZMAT-HMBP", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: tickets }],
      repair_tickets: tickets,
      coverage_family_statuses: [{ id: "cf-hazmat", family: "hazmat", status: "active", reason: "", project_facts_considered: [], missing_facts: [] }],
    });

    const result = groupDeterminationsByFamily(run);
    const hazmat = result.get("hazmat")!;
    expect(hazmat.repairTickets).toHaveLength(1);
    expect(hazmat.repairTickets[0].ticket_id).toBe("t1");
  });

  it("sets familyStatus from coverage_family_statuses", () => {
    const hypotheses: ResearchHypothesis[] = [
      { id: "H-STORM-IGP", angle_id: "a1", family: "stormwater", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
    ];
    const familyStatuses: CoverageFamilyStatus[] = [
      { id: "cf-storm", family: "stormwater", status: "blocked_missing_fact", reason: "missing acres", project_facts_considered: [], missing_facts: ["acres"] },
    ];
    const run = makeRun({
      research_graph: hypotheses,
      determinations: [{ requirement: "IGP", applies: "needs_review", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.5, verified: false, review_flag: true }],
      evidence_bundles: [],
      verification_verdicts: [],
      coverage_family_statuses: familyStatuses,
    });

    const result = groupDeterminationsByFamily(run);
    const storm = result.get("stormwater")!;
    expect(storm.familyStatus.status).toBe("blocked_missing_fact");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/ui/__tests__/groupDeterminationsByFamily.test.ts`
Expected: FAIL — `groupDeterminationsByFamily` is not exported from `../selectors`.

- [ ] **Step 3: Implement `groupDeterminationsByFamily` in `selectors.ts`**

Add the following to the end of `src/lib/ui/selectors.ts`:

```ts
import type {
  ResearchRun,
  VerificationVerdict,
  CoverageFamily,
  CoverageFamilyStatus,
  Determination,
  EvidenceBundle,
  RepairTicket,
} from "@/lib/research/types";

export type FamilyReport = {
  family: CoverageFamily;
  familyStatus: CoverageFamilyStatus;
  determinations: Determination[];
  evidenceBundles: EvidenceBundle[];
  verdicts: VerificationVerdict[];
  repairTickets: RepairTicket[];
};

export function groupDeterminationsByFamily(run: ResearchRun): Map<CoverageFamily, FamilyReport> {
  const result = new Map<CoverageFamily, FamilyReport>();
  const familyStatusMap = new Map(run.coverage_family_statuses.map((s) => [s.family, s]));
  const evidenceByHyp = new Map(run.evidence_bundles.map((b) => [b.hypothesis_id, b]));
  const lastVerdictByHyp = new Map<string, VerificationVerdict>();
  for (const v of run.verification_verdicts) {
    lastVerdictByHyp.set(v.hypothesis_id, v);
  }
  const ticketsByHyp = new Map<string, RepairTicket[]>();
  for (const t of run.repair_tickets) {
    const existing = ticketsByHyp.get(t.hypothesis_id) ?? [];
    existing.push(t);
    ticketsByHyp.set(t.hypothesis_id, existing);
  }

  run.research_graph.forEach((hypothesis, index) => {
    const family = hypothesis.family;
    if (!result.has(family)) {
      const defaultStatus: CoverageFamilyStatus = familyStatusMap.get(family) ?? {
        id: `cf-${family}`,
        family,
        status: "active",
        reason: "",
        project_facts_considered: [],
        missing_facts: [],
      };
      result.set(family, {
        family,
        familyStatus: defaultStatus,
        determinations: [],
        evidenceBundles: [],
        verdicts: [],
        repairTickets: [],
      });
    }
    const group = result.get(family)!;

    const determination = run.determinations[index];
    if (determination) {
      group.determinations.push(determination);
    }

    const bundle = evidenceByHyp.get(hypothesis.id);
    if (bundle) {
      group.evidenceBundles.push(bundle);
    }

    const verdict = lastVerdictByHyp.get(hypothesis.id);
    if (verdict) {
      group.verdicts.push(verdict);
    }

    const tickets = ticketsByHyp.get(hypothesis.id);
    if (tickets) {
      group.repairTickets.push(...tickets);
    }
  });

  return result;
}
```

Note: The existing import line at the top of `selectors.ts` is:
```ts
import type { ResearchRun, VerificationVerdict } from "@/lib/research/types";
```

Expand it to:
```ts
import type {
  ResearchRun,
  VerificationVerdict,
  CoverageFamily,
  CoverageFamilyStatus,
  Determination,
  EvidenceBundle,
  RepairTicket,
} from "@/lib/research/types";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/ui/__tests__/groupDeterminationsByFamily.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Run all existing tests to check no regressions**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/selectors.ts src/lib/ui/__tests__/groupDeterminationsByFamily.test.ts
git commit -m "feat(selectors): add groupDeterminationsByFamily selector with tests"
```

---

### Task 6: Store changes — `reportFamily` state

**Files:**
- Create: `src/lib/ui/__tests__/store-report.test.ts`
- Modify: `src/lib/ui/store.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ui/__tests__/store-report.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../store";

describe("store reportFamily slice", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("starts with reportFamily as null", () => {
    expect(useStore.getState().reportFamily).toBeNull();
  });

  it("openReport sets reportFamily", () => {
    useStore.getState().openReport("air");
    expect(useStore.getState().reportFamily).toBe("air");
  });

  it("closeReport resets reportFamily to null", () => {
    useStore.getState().openReport("hazmat");
    expect(useStore.getState().reportFamily).toBe("hazmat");
    useStore.getState().closeReport();
    expect(useStore.getState().reportFamily).toBeNull();
  });

  it("openReport replaces previous family", () => {
    useStore.getState().openReport("air");
    useStore.getState().openReport("stormwater");
    expect(useStore.getState().reportFamily).toBe("stormwater");
  });

  it("reset clears reportFamily", () => {
    useStore.getState().openReport("waste");
    useStore.getState().reset();
    expect(useStore.getState().reportFamily).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/ui/__tests__/store-report.test.ts`
Expected: FAIL — `openReport` and `closeReport` and `reportFamily` do not exist on the store type.

- [ ] **Step 3: Add `reportFamily`, `openReport`, `closeReport` to store**

In `src/lib/ui/store.ts`:

**a)** Add the import for `CoverageFamily`:

```ts
import type { ResearchRun, ResearchRunInput, CoverageFamily } from "@/lib/research/types";
```

**b)** Add to the `Store` type (after `matrixFilter: MatrixFilter;`):

```ts
reportFamily: CoverageFamily | null;
openReport: (family: CoverageFamily) => void;
closeReport: () => void;
```

**c)** Add to the `initial` object (after `matrixFilter: "all" as MatrixFilter,`):

```ts
reportFamily: null as CoverageFamily | null,
```

**d)** Add the action implementations inside `create<Store>((set, get) => ({`, after `setMatrixFilter`:

```ts
openReport: (family) => set({ reportFamily: family }),
closeReport: () => set({ reportFamily: null }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/ui/__tests__/store-report.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/store.ts src/lib/ui/__tests__/store-report.test.ts
git commit -m "feat(store): add reportFamily state with openReport/closeReport actions"
```

---

### Task 7: `ReportCards` component

**Files:**
- Create: `app/components/__tests__/ReportCards.test.tsx`
- Create: `app/components/ReportCards.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/components/__tests__/ReportCards.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReportCards } from "../ReportCards";
import { useStore } from "@/lib/ui/store";
import type { ResearchRun, ResearchHypothesis, Determination, CoverageFamilyStatus } from "@/lib/research/types";

function seedStore() {
  const hypotheses: ResearchHypothesis[] = [
    { id: "H-AIR-201", angle_id: "a1", family: "air", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
    { id: "H-AIR-219", angle_id: "a1", family: "air", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
    { id: "H-HAZMAT-HMBP", angle_id: "a2", family: "hazmat", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
  ];
  const determinations: Determination[] = [
    { requirement: "SCAQMD Permit", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.9, verified: true, review_flag: false },
    { requirement: "Rule 219", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.9, verified: true, review_flag: false },
    { requirement: "HMBP", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.8, verified: false, review_flag: true },
  ];
  const familyStatuses: CoverageFamilyStatus[] = [
    { id: "cf-air", family: "air", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
    { id: "cf-hazmat", family: "hazmat", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
    { id: "cf-storm", family: "stormwater", status: "out_of_scope", reason: "no stormwater", project_facts_considered: [], missing_facts: [] },
  ];
  useStore.setState({
    run: {
      run_id: "test", status: "done", project_facts: {}, jurisdiction_stack: [],
      scope_pack: {} as never, coverage_family_statuses: familyStatuses,
      regulatory_angles: [], research_graph: hypotheses, research_tasks: [],
      evidence_bundles: [
        { hypothesis_id: "H-AIR-201", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
        { hypothesis_id: "H-AIR-219", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
        { hypothesis_id: "H-HAZMAT-HMBP", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
      ],
      verification_verdicts: [
        { hypothesis_id: "H-AIR-201", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: [] },
        { hypothesis_id: "H-AIR-219", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: [] },
        { hypothesis_id: "H-HAZMAT-HMBP", verdict: "needs_review", checks: {}, confidence: 0.8, repair_tickets: [] },
      ],
      repair_tickets: [], memory_updates: [], determinations, trace_events: [], report_markdown: "",
    } as ResearchRun,
    replayDone: true,
  });
}

describe("ReportCards", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("renders nothing before replay completes", () => {
    useStore.setState({ run: { research_graph: [] } as unknown as ResearchRun, replayDone: false });
    const { container } = render(<ReportCards />);
    expect(container.innerHTML).toBe("");
  });

  it("renders a card for each family with determinations", () => {
    seedStore();
    render(<ReportCards />);
    expect(screen.getByText("Air Quality")).toBeDefined();
    expect(screen.getByText("Hazmat")).toBeDefined();
  });

  it("shows out_of_scope families as dimmed with 'Not triggered'", () => {
    seedStore();
    render(<ReportCards />);
    expect(screen.getByText("Stormwater")).toBeDefined();
    expect(screen.getByText("Not triggered")).toBeDefined();
  });

  it("clicking an active card calls openReport", () => {
    seedStore();
    render(<ReportCards />);
    fireEvent.click(screen.getByText("Air Quality"));
    expect(useStore.getState().reportFamily).toBe("air");
  });

  it("clicking a dimmed card does not call openReport", () => {
    seedStore();
    render(<ReportCards />);
    fireEvent.click(screen.getByText("Stormwater"));
    expect(useStore.getState().reportFamily).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run app/components/__tests__/ReportCards.test.tsx`
Expected: FAIL — `ReportCards` module not found.

- [ ] **Step 3: Implement `ReportCards.tsx`**

Create `app/components/ReportCards.tsx`:

```tsx
"use client";
import { useStore } from "@/lib/ui/store";
import { groupDeterminationsByFamily } from "@/lib/ui/selectors";
import type { CoverageFamily } from "@/lib/research/types";

const FAMILY_LABELS: Record<CoverageFamily, string> = {
  air: "Air Quality",
  stormwater: "Stormwater",
  hazmat: "Hazmat",
  waste: "Haz Waste",
  wastewater: "Wastewater",
  land_use: "Land Use",
  fire_code: "Fire Code",
  ceqa: "CEQA",
  osha: "OSHA",
};

const FAMILY_ORDER: CoverageFamily[] = ["air", "stormwater", "hazmat", "waste", "wastewater"];

export function ReportCards() {
  const run = useStore((s) => s.run);
  const replayDone = useStore((s) => s.replayDone);
  const openReport = useStore((s) => s.openReport);

  if (!run || !replayDone) return null;

  const grouped = groupDeterminationsByFamily(run);
  const familyStatusMap = new Map(run.coverage_family_statuses.map((s) => [s.family, s]));

  return (
    <section className="border-t border-slate-800 bg-slate-900 p-4">
      <div className="grid grid-cols-5 gap-3">
        {FAMILY_ORDER.map((family) => {
          const report = grouped.get(family);
          const status = familyStatusMap.get(family);
          const isOutOfScope = status?.status === "out_of_scope";
          const determinations = report?.determinations ?? [];
          const verifiedCount = determinations.filter((d) => d.verified).length;
          const reviewCount = determinations.filter((d) => d.review_flag).length;

          const borderColor = isOutOfScope
            ? "border-l-slate-600"
            : reviewCount > 0
            ? "border-l-amber-500"
            : verifiedCount === determinations.length && determinations.length > 0
            ? "border-l-emerald-500"
            : "border-l-red-500";

          return (
            <div
              key={family}
              role="button"
              tabIndex={isOutOfScope ? -1 : 0}
              onClick={() => !isOutOfScope && openReport(family)}
              onKeyDown={(e) => {
                if (!isOutOfScope && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  openReport(family);
                }
              }}
              className={`border-l-4 ${borderColor} rounded-md bg-slate-800 p-3 transition-colors ${
                isOutOfScope
                  ? "opacity-40 cursor-default"
                  : "cursor-pointer hover:bg-slate-700"
              }`}
            >
              <div className="text-sm font-semibold text-slate-100 mb-2">
                {FAMILY_LABELS[family]}
              </div>
              {isOutOfScope ? (
                <div className="text-xs text-slate-400">Not triggered</div>
              ) : (
                <>
                  <div className="text-xs text-slate-400 mb-2 line-clamp-2">
                    {determinations.map((d) => d.requirement).join(" + ")}
                  </div>
                  <div className="flex gap-2 text-[10px]">
                    {verifiedCount > 0 && (
                      <span className="text-emerald-400">
                        {verifiedCount} verified
                      </span>
                    )}
                    {reviewCount > 0 && (
                      <span className="text-amber-400">
                        {reviewCount} review
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run app/components/__tests__/ReportCards.test.tsx`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/ReportCards.tsx app/components/__tests__/ReportCards.test.tsx
git commit -m "feat(ui): add ReportCards component with coverage family card grid"
```

---

### Task 8: `ReportOverlay` component (container + close)

**Files:**
- Create: `app/components/__tests__/ReportOverlay.test.tsx`
- Create: `app/components/ReportOverlay.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/components/__tests__/ReportOverlay.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReportOverlay } from "../ReportOverlay";
import { useStore } from "@/lib/ui/store";
import type { ResearchRun } from "@/lib/research/types";

function seedStore() {
  useStore.setState({
    run: {
      run_id: "test", status: "done", project_facts: {}, jurisdiction_stack: [],
      scope_pack: {} as never, coverage_family_statuses: [
        { id: "cf-air", family: "air", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
      ],
      regulatory_angles: [],
      research_graph: [
        { id: "H-AIR-201", angle_id: "a1", family: "air", question: "Need permit?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
      ],
      research_tasks: [],
      evidence_bundles: [
        { hypothesis_id: "H-AIR-201", sources: [{ url: "u", source_name: "SCAQMD", authority_rank: 1, fetched_at: "2026-01-01", content_hash: "abc", effective_date: null, quote: "test quote" }], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
      ],
      verification_verdicts: [
        { hypothesis_id: "H-AIR-201", verdict: "pass", checks: { currency: { pass: true, reason: "ok" } }, confidence: 0.9, repair_tickets: [] },
      ],
      repair_tickets: [], memory_updates: [],
      determinations: [
        { requirement: "SCAQMD 201", applies: "yes", trigger: "Need permit?", project_fact: "equipment", citation: "c", quote: "test quote", source_url: "u", confidence: 0.9, verified: true, review_flag: false },
      ],
      trace_events: [], report_markdown: "",
    } as ResearchRun,
    replayDone: true,
    reportFamily: "air",
  });
}

describe("ReportOverlay", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("renders nothing when reportFamily is null", () => {
    const { container } = render(<ReportOverlay />);
    expect(container.innerHTML).toBe("");
  });

  it("renders overlay when reportFamily is set", () => {
    seedStore();
    render(<ReportOverlay />);
    expect(screen.getByText("Air Quality")).toBeDefined();
  });

  it("close button calls closeReport", () => {
    seedStore();
    render(<ReportOverlay />);
    fireEvent.click(screen.getByLabelText("Close overlay"));
    expect(useStore.getState().reportFamily).toBeNull();
  });

  it("Escape key closes overlay", () => {
    seedStore();
    render(<ReportOverlay />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useStore.getState().reportFamily).toBeNull();
  });

  it("clicking backdrop closes overlay", () => {
    seedStore();
    render(<ReportOverlay />);
    fireEvent.click(screen.getByTestId("overlay-backdrop"));
    expect(useStore.getState().reportFamily).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run app/components/__tests__/ReportOverlay.test.tsx`
Expected: FAIL — `ReportOverlay` module not found.

- [ ] **Step 3: Implement `ReportOverlay.tsx`**

Create `app/components/ReportOverlay.tsx`:

```tsx
"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/ui/store";
import { groupDeterminationsByFamily } from "@/lib/ui/selectors";
import { SynthesisDetail } from "./SynthesisDetail";
import { PermitPane } from "./PermitPane";
import type { CoverageFamily } from "@/lib/research/types";

const FAMILY_LABELS: Record<CoverageFamily, string> = {
  air: "Air Quality",
  stormwater: "Stormwater",
  hazmat: "Hazmat",
  waste: "Haz Waste",
  wastewater: "Wastewater",
  land_use: "Land Use",
  fire_code: "Fire Code",
  ceqa: "CEQA",
  osha: "OSHA",
};

export function ReportOverlay() {
  const run = useStore((s) => s.run);
  const reportFamily = useStore((s) => s.reportFamily);
  const closeReport = useStore((s) => s.closeReport);

  useEffect(() => {
    if (!reportFamily) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeReport();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [reportFamily, closeReport]);

  if (!run || !reportFamily) return null;

  const grouped = groupDeterminationsByFamily(run);
  const familyReport = grouped.get(reportFamily);
  if (!familyReport) return null;

  return (
    <div
      data-testid="overlay-backdrop"
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ background: "rgba(2, 6, 23, 0.92)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeReport();
      }}
    >
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-xl overflow-hidden grid grid-cols-2"
        style={{ maxWidth: 1400, width: "95vw", height: "calc(100vh - 48px)", marginTop: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={closeReport}
          aria-label="Close overlay"
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-md bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors border-0 cursor-pointer text-lg leading-none"
        >
          ✕
        </button>
        <SynthesisDetail
          familyLabel={FAMILY_LABELS[reportFamily]}
          report={familyReport}
          run={run}
        />
        <PermitPane report={familyReport} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create stub `SynthesisDetail` and `PermitPane` so `ReportOverlay` compiles**

Create `app/components/SynthesisDetail.tsx` (stub — full implementation in Task 9):

```tsx
"use client";
import type { FamilyReport } from "@/lib/ui/selectors";
import type { ResearchRun } from "@/lib/research/types";

export function SynthesisDetail({
  familyLabel,
  report,
  run,
}: {
  familyLabel: string;
  report: FamilyReport;
  run: ResearchRun;
}) {
  return (
    <div className="overflow-y-auto p-5 border-r border-slate-700">
      <h2 className="text-lg font-bold text-slate-100">{familyLabel}</h2>
    </div>
  );
}
```

Create `app/components/PermitPane.tsx` (stub — full implementation in Task 10):

```tsx
"use client";
import type { FamilyReport } from "@/lib/ui/selectors";

export function PermitPane({ report }: { report: FamilyReport }) {
  return (
    <div className="p-5 bg-slate-800/50">
      <div className="text-xs text-slate-400 uppercase tracking-wider">Permit to File</div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run app/components/__tests__/ReportOverlay.test.tsx`
Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/components/ReportOverlay.tsx app/components/SynthesisDetail.tsx app/components/PermitPane.tsx app/components/__tests__/ReportOverlay.test.tsx
git commit -m "feat(ui): add ReportOverlay with backdrop close, Escape key, close button"
```

---

### Task 9: `SynthesisDetail` component (left pane)

**Files:**
- Create: `app/components/__tests__/SynthesisDetail.test.tsx`
- Modify: `app/components/SynthesisDetail.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/components/__tests__/SynthesisDetail.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SynthesisDetail } from "../SynthesisDetail";
import type { FamilyReport } from "@/lib/ui/selectors";
import type { ResearchRun } from "@/lib/research/types";

function makeReport(overrides: Partial<FamilyReport> = {}): FamilyReport {
  return {
    family: "hazmat",
    familyStatus: { id: "cf-hazmat", family: "hazmat", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
    determinations: [
      {
        requirement: "HMBP/CERS reporting",
        applies: "yes",
        trigger: "Hazardous material exceeds threshold?",
        project_fact: "60 gallons flammable solvent",
        citation: "CalEPA HMBP Summary, fetched 2026-05-30",
        quote: "quantities equal to or greater than 55 gallons for liquids",
        source_url: "https://calepa.ca.gov/cupa/hmbp/",
        confidence: 0.9,
        verified: true,
        review_flag: false,
        permit_filing: {
          form_name: "HMBP",
          form_url: "https://cers.calepa.ca.gov/",
          agency: "CalEPA",
          portal_url: "https://cers.calepa.ca.gov/",
        },
      },
    ],
    evidenceBundles: [
      {
        hypothesis_id: "H-HAZMAT-HMBP",
        sources: [{
          url: "https://calepa.ca.gov/cupa/hmbp/",
          source_name: "CalEPA HMBP Threshold Summary",
          authority_rank: 1,
          fetched_at: "2026-05-30T00:00:00Z",
          content_hash: "sha256:demo-hmbp-repaired",
          effective_date: null,
          quote: "quantities equal to or greater than 55 gallons for liquids",
        }],
        extracted_claims: [],
        researcher_conclusion: "applies",
        uncertainties: [],
      },
    ],
    verdicts: [
      {
        hypothesis_id: "H-HAZMAT-HMBP",
        verdict: "pass",
        checks: {
          currency: { pass: true, reason: "Source dated 2026" },
          authority: { pass: true, reason: "CalEPA is authoritative" },
          grounding: { pass: true, reason: "Quote supports claim" },
          predicate_math: { pass: true, reason: "60 >= 55 gallons" },
        },
        confidence: 0.9,
        repair_tickets: [],
      },
    ],
    repairTickets: [],
    ...overrides,
  };
}

const stubRun = {
  verification_verdicts: [],
  repair_tickets: [],
  evidence_bundles: [],
} as unknown as ResearchRun;

describe("SynthesisDetail", () => {
  it("renders family label as heading", () => {
    render(<SynthesisDetail familyLabel="Hazmat" report={makeReport()} run={stubRun} />);
    expect(screen.getByText("Hazmat")).toBeDefined();
  });

  it("renders determination summary fields", () => {
    render(<SynthesisDetail familyLabel="Hazmat" report={makeReport()} run={stubRun} />);
    expect(screen.getByText(/HMBP\/CERS reporting/)).toBeDefined();
    expect(screen.getByText(/60 gallons flammable solvent/)).toBeDefined();
  });

  it("renders source evidence with quote", () => {
    render(<SynthesisDetail familyLabel="Hazmat" report={makeReport()} run={stubRun} />);
    expect(screen.getByText("CalEPA HMBP Threshold Summary")).toBeDefined();
    expect(screen.getByText(/55 gallons for liquids/)).toBeDefined();
  });

  it("renders verifier checks", () => {
    render(<SynthesisDetail familyLabel="Hazmat" report={makeReport()} run={stubRun} />);
    expect(screen.getByText(/currency/)).toBeDefined();
    expect(screen.getByText(/authority/)).toBeDefined();
    expect(screen.getByText(/grounding/)).toBeDefined();
    expect(screen.getByText(/predicate_math/)).toBeDefined();
  });

  it("renders repair history when tickets exist", () => {
    const report = makeReport({
      repairTickets: [{
        ticket_id: "t1",
        hypothesis_id: "H-HAZMAT-HMBP",
        failure_type: "grounding_failed",
        failed_check: "grounding",
        observed_problem: "Claim broader than quote",
        repair_action: "Re-extract with threshold constraint",
        max_attempts_remaining: 1,
      }],
    });
    const runWithHistory = {
      ...stubRun,
      verification_verdicts: [
        { hypothesis_id: "H-HAZMAT-HMBP", verdict: "fail" as const, checks: { grounding: { pass: false, reason: "Claim broader than quote" } }, confidence: 0.2, repair_tickets: [] },
        { hypothesis_id: "H-HAZMAT-HMBP", verdict: "pass" as const, checks: { grounding: { pass: true, reason: "ok" } }, confidence: 0.9, repair_tickets: [] },
      ],
      repair_tickets: report.repairTickets,
      evidence_bundles: report.evidenceBundles,
    } as unknown as ResearchRun;

    render(<SynthesisDetail familyLabel="Hazmat" report={report} run={runWithHistory} />);
    expect(screen.getByText(/Repair history/)).toBeDefined();
  });

  it("shows verified/needs_review badge counts", () => {
    render(<SynthesisDetail familyLabel="Hazmat" report={makeReport()} run={stubRun} />);
    expect(screen.getByText(/1 verified/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run app/components/__tests__/SynthesisDetail.test.tsx`
Expected: FAIL — the stub `SynthesisDetail` only renders the heading, not the determination details.

- [ ] **Step 3: Implement full `SynthesisDetail.tsx`**

Replace the stub in `app/components/SynthesisDetail.tsx` with:

```tsx
"use client";
import type { FamilyReport } from "@/lib/ui/selectors";
import type { ResearchRun } from "@/lib/research/types";
import { getRepairHistory } from "@/lib/ui/selectors";

export function SynthesisDetail({
  familyLabel,
  report,
  run,
}: {
  familyLabel: string;
  report: FamilyReport;
  run: ResearchRun;
}) {
  const verifiedCount = report.determinations.filter((d) => d.verified).length;
  const reviewCount = report.determinations.filter((d) => d.review_flag).length;

  return (
    <div className="overflow-y-auto p-5 border-r border-slate-700">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-100">{familyLabel}</h2>
        <div className="flex gap-2 mt-1 text-xs">
          {verifiedCount > 0 && (
            <span className="bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded-full">
              {verifiedCount} verified
            </span>
          )}
          {reviewCount > 0 && (
            <span className="bg-amber-950 text-amber-400 px-2 py-0.5 rounded-full">
              {reviewCount} needs_review
            </span>
          )}
        </div>
      </div>

      {report.determinations.map((det, i) => {
        const bundle = report.evidenceBundles[i];
        const verdict = report.verdicts[i];
        const hypothesisId = bundle?.hypothesis_id;
        const history = hypothesisId ? getRepairHistory(run, hypothesisId) : [];

        return (
          <div key={i} className="mb-5">
            {/* 1. Determination summary */}
            <div className="bg-slate-800 rounded-lg p-3 mb-2">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                Determination
              </div>
              <div className="text-sm font-semibold text-slate-100 mb-1">
                {det.requirement}
              </div>
              <div className="text-xs text-slate-300">
                <strong>Applies:</strong> {det.applies}
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                <strong>Trigger:</strong> {det.trigger}
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                <strong>Project fact:</strong> {det.project_fact}
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                <strong>Confidence:</strong> {det.confidence.toFixed(2)}
              </div>
            </div>

            {/* 2. Source evidence */}
            {bundle?.sources.map((source, si) => (
              <div key={si} className="bg-slate-800 rounded-lg p-3 mb-2">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                  Source Evidence
                </div>
                <div className="text-xs font-semibold text-slate-100">
                  {source.source_name}
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-sky-400 hover:text-sky-300 break-all"
                >
                  {source.url}
                </a>
                <blockquote className="my-2 px-2.5 py-1.5 border-l-2 border-sky-400 text-xs italic text-slate-200">
                  {source.quote}
                </blockquote>
                <div className="text-[10px] text-slate-500">
                  fetched {source.fetched_at.slice(0, 10)} · hash{" "}
                  {source.content_hash.slice(0, 12)}
                </div>
              </div>
            ))}

            {/* 3. Verifier checks */}
            {verdict && (
              <div className="bg-slate-800 rounded-lg p-3 mb-2">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                  Verifier Checks
                </div>
                {Object.entries(verdict.checks).map(([checkName, check]) => (
                  <div key={checkName} className="text-[11px] py-0.5 text-slate-100">
                    <span className={check.pass ? "text-emerald-500" : "text-red-500"}>
                      {check.pass ? "✓" : "✗"}
                    </span>{" "}
                    {checkName}:{" "}
                    <span className="text-slate-400">{check.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 4. Repair history */}
            {history.length > 1 && (
              <div className="bg-slate-800 rounded-lg p-3 mb-2">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                  Repair history ({history.length} attempts)
                </div>
                {history.map((h, hi) => (
                  <div
                    key={hi}
                    className={`${hi > 0 ? "mt-2 pt-2 border-t border-dashed border-slate-700" : ""}`}
                  >
                    <div
                      className={`text-xs ${
                        h.verdict === "pass" ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      Attempt {h.attempt} — {h.verdict.toUpperCase()}
                      {h.failed_check ? ` (${h.failed_check})` : ""}
                    </div>
                    {h.failure_reason && (
                      <div className="text-[11px] text-slate-400">
                        Reason: {h.failure_reason}
                      </div>
                    )}
                    {h.repair_action && (
                      <div className="text-[11px] text-slate-400">
                        Action: {h.repair_action}
                      </div>
                    )}
                    {h.quote && (
                      <blockquote className="my-1 px-2 py-1 border-l-2 border-slate-700 text-[11px] italic text-slate-300">
                        {h.quote}
                      </blockquote>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run app/components/__tests__/SynthesisDetail.test.tsx`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/SynthesisDetail.tsx app/components/__tests__/SynthesisDetail.test.tsx
git commit -m "feat(ui): implement SynthesisDetail left pane with determination, evidence, checks, repair"
```

---

### Task 10: `PermitPane` component (right pane)

**Files:**
- Create: `app/components/__tests__/PermitPane.test.tsx`
- Modify: `app/components/PermitPane.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/components/__tests__/PermitPane.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermitPane } from "../PermitPane";
import type { FamilyReport } from "@/lib/ui/selectors";

function makeReport(overrides: Partial<FamilyReport> = {}): FamilyReport {
  return {
    family: "hazmat",
    familyStatus: { id: "cf-hazmat", family: "hazmat", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
    determinations: [],
    evidenceBundles: [],
    verdicts: [],
    repairTickets: [],
    ...overrides,
  };
}

describe("PermitPane", () => {
  it("shows 'Permit not yet identified' when no determinations have permit_filing", () => {
    const report = makeReport({
      determinations: [{
        requirement: "HMBP", applies: "needs_review", trigger: "?", project_fact: "f",
        citation: "c", quote: "q", source_url: "u", confidence: 0.5,
        verified: false, review_flag: true,
      }],
    });
    render(<PermitPane report={report} />);
    expect(screen.getByText("Permit not yet identified")).toBeDefined();
  });

  it("renders permit details when permit_filing exists", () => {
    const report = makeReport({
      determinations: [{
        requirement: "HMBP", applies: "yes", trigger: "?", project_fact: "f",
        citation: "c", quote: "q", source_url: "u", confidence: 0.9,
        verified: true, review_flag: false,
        permit_filing: {
          form_name: "Hazardous Materials Business Plan (HMBP)",
          form_url: "https://cers.calepa.ca.gov/",
          agency: "CalEPA / Local CUPA",
          portal_url: "https://cers.calepa.ca.gov/",
          instructions: "Submit through CERS portal",
        },
      }],
    });
    render(<PermitPane report={report} />);
    expect(screen.getByText("Hazardous Materials Business Plan (HMBP)")).toBeDefined();
    expect(screen.getByText("CalEPA / Local CUPA")).toBeDefined();
    expect(screen.getByText("Submit through CERS portal")).toBeDefined();
    expect(screen.getByText("Open Filing Portal")).toBeDefined();
  });

  it("renders tabs when multiple permits exist", () => {
    const report = makeReport({
      determinations: [
        {
          requirement: "SCAQMD 201", applies: "yes", trigger: "?", project_fact: "f",
          citation: "c", quote: "q", source_url: "u", confidence: 0.9,
          verified: true, review_flag: false,
          permit_filing: {
            form_name: "Permit to Construct",
            form_url: "https://aqmd.gov/ptc",
            agency: "SCAQMD",
            portal_url: "https://aqmd.gov/permits",
          },
        },
        {
          requirement: "Rule 219", applies: "yes", trigger: "?", project_fact: "f",
          citation: "c", quote: "q", source_url: "u", confidence: 0.9,
          verified: true, review_flag: false,
          permit_filing: {
            form_name: "Rule 219 Exemption",
            form_url: "https://aqmd.gov/219",
            agency: "SCAQMD",
            portal_url: "https://aqmd.gov/permits",
          },
        },
      ],
    });
    render(<PermitPane report={report} />);
    expect(screen.getByText("Permit to Construct")).toBeDefined();
    expect(screen.getByText("Rule 219 Exemption")).toBeDefined();
  });

  it("switches permit view when clicking a tab", () => {
    const report = makeReport({
      determinations: [
        {
          requirement: "SCAQMD 201", applies: "yes", trigger: "?", project_fact: "f",
          citation: "c", quote: "q", source_url: "u", confidence: 0.9,
          verified: true, review_flag: false,
          permit_filing: {
            form_name: "Permit to Construct",
            form_url: "https://aqmd.gov/ptc",
            agency: "SCAQMD",
            portal_url: "https://aqmd.gov/permits",
          },
        },
        {
          requirement: "Rule 219", applies: "yes", trigger: "?", project_fact: "f",
          citation: "c", quote: "q", source_url: "u", confidence: 0.9,
          verified: true, review_flag: false,
          permit_filing: {
            form_name: "Rule 219 Exemption",
            form_url: "https://aqmd.gov/219",
            agency: "SCAQMD Portal",
            portal_url: "https://aqmd.gov/permits",
          },
        },
      ],
    });
    render(<PermitPane report={report} />);
    // Click second tab
    fireEvent.click(screen.getByText("Rule 219 Exemption"));
    expect(screen.getByText("SCAQMD Portal")).toBeDefined();
  });

  it("renders iframe for PDF URLs", () => {
    const report = makeReport({
      determinations: [{
        requirement: "Test", applies: "yes", trigger: "?", project_fact: "f",
        citation: "c", quote: "q", source_url: "u", confidence: 0.9,
        verified: true, review_flag: false,
        permit_filing: {
          form_name: "Test Form",
          form_url: "https://example.com/form.pdf",
          agency: "Test Agency",
          portal_url: "https://example.com/portal",
        },
      }],
    });
    const { container } = render(<PermitPane report={report} />);
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeDefined();
    expect(iframe?.getAttribute("src")).toBe("https://example.com/form.pdf");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run app/components/__tests__/PermitPane.test.tsx`
Expected: FAIL — the stub `PermitPane` doesn't render any permit details.

- [ ] **Step 3: Implement full `PermitPane.tsx`**

Replace the stub in `app/components/PermitPane.tsx` with:

```tsx
"use client";
import { useState } from "react";
import type { FamilyReport } from "@/lib/ui/selectors";

export function PermitPane({ report }: { report: FamilyReport }) {
  const permitsWithFiling = report.determinations.filter((d) => d.permit_filing);
  const [activeTab, setActiveTab] = useState(0);

  if (permitsWithFiling.length === 0) {
    return (
      <div className="p-5 bg-slate-800/50 flex flex-col items-center justify-center text-center">
        <div className="text-4xl mb-3">📋</div>
        <div className="text-sm font-semibold text-slate-300 mb-2">
          Permit not yet identified
        </div>
        <div className="text-xs text-slate-400 max-w-xs">
          Resolve missing facts or review evidence to determine filing requirements.
        </div>
      </div>
    );
  }

  const activeDet = permitsWithFiling[activeTab];
  const filing = activeDet?.permit_filing;
  if (!filing) return null;

  const isPdf = filing.form_url.endsWith(".pdf");

  return (
    <div className="p-5 bg-slate-800/50 flex flex-col">
      {/* Tabs for multi-permit families */}
      {permitsWithFiling.length > 1 && (
        <div className="flex gap-1 mb-4 border-b border-slate-700 pb-2">
          {permitsWithFiling.map((det, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors border-0 cursor-pointer ${
                activeTab === i
                  ? "bg-sky-900 text-sky-300"
                  : "bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-700"
              }`}
            >
              {det.permit_filing!.form_name}
            </button>
          ))}
        </div>
      )}

      <div className="text-[10px] text-sky-400 uppercase tracking-wider font-semibold mb-2">
        Permit to File
      </div>
      <div className="text-base font-semibold text-slate-100 mb-1">
        {filing.form_name}
      </div>
      <div className="text-xs text-slate-400 mb-4">
        {filing.agency}
      </div>

      {/* PDF iframe or portal link */}
      <div className="flex-1 min-h-0 rounded-lg overflow-hidden mb-4">
        {isPdf ? (
          <iframe
            src={filing.form_url}
            className="w-full h-full border-0 rounded-lg bg-white"
            title={filing.form_name}
          />
        ) : (
          <div className="w-full h-full bg-slate-900 rounded-lg flex items-center justify-center text-center p-6">
            <div>
              <div className="text-3xl mb-3">🌐</div>
              <div className="text-sm text-slate-300 mb-1">Online Portal</div>
              <a
                href={filing.form_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sky-400 hover:text-sky-300 break-all"
              >
                {filing.form_url}
              </a>
            </div>
          </div>
        )}
      </div>

      {filing.instructions && (
        <div className="text-xs text-slate-300 mb-3">
          {filing.instructions}
        </div>
      )}

      <a
        href={filing.portal_url}
        target="_blank"
        rel="noreferrer"
        className="block text-center bg-sky-600 hover:bg-sky-500 text-white py-2.5 px-4 rounded-lg text-sm font-semibold no-underline transition-colors"
      >
        Open Filing Portal
      </a>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run app/components/__tests__/PermitPane.test.tsx`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/PermitPane.tsx app/components/__tests__/PermitPane.test.tsx
git commit -m "feat(ui): implement PermitPane right pane with PDF iframe, tabs, portal link"
```

---

### Task 11: Page layout — swap BottomPanel for ReportCards + ReportOverlay

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Update imports in `app/page.tsx`**

Remove the import:
```ts
import { BottomPanel } from "./components/BottomPanel";
```

Add imports:
```ts
import { ReportCards } from "./components/ReportCards";
import { ReportOverlay } from "./components/ReportOverlay";
```

- [ ] **Step 2: Replace `<BottomPanel />` in the JSX**

Replace:
```tsx
<BottomPanel />
```

With:
```tsx
<ReportCards />
<ReportOverlay />
```

The full return block becomes:

```tsx
return (
  <div className="grid grid-rows-[auto_1fr_auto] h-screen bg-slate-950 text-slate-100">
    <Header />
    <div className="grid grid-cols-[320px_minmax(0,1fr)_360px] overflow-hidden relative">
      <InputPanel />
      <main className="relative overflow-hidden">
        {showGrid ? <SandboxGrid /> : <ResearchGraph />}
      </main>
      <SidePanel />
      <EvidenceDrawer />
    </div>
    <ReportCards />
    <ReportOverlay />
  </div>
);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(layout): replace BottomPanel with ReportCards + ReportOverlay in page layout"
```

---

### Task 12: Remove old components

**Files:**
- Remove: `app/components/BottomPanel.tsx`
- Remove: `app/components/ReportTab.tsx`

- [ ] **Step 1: Delete `BottomPanel.tsx`**

```bash
rm app/components/BottomPanel.tsx
```

- [ ] **Step 2: Delete `ReportTab.tsx`**

```bash
rm app/components/ReportTab.tsx
```

- [ ] **Step 3: Check for any remaining imports of removed components**

```bash
grep -r "BottomPanel\|ReportTab" app/ src/ --include="*.ts" --include="*.tsx"
```

Expected: No results (page.tsx import was already updated in Task 11). If any remain, update them.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Run all tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add -u app/components/BottomPanel.tsx app/components/ReportTab.tsx
git commit -m "chore: remove BottomPanel and ReportTab, replaced by ReportCards + overlay"
```

---

### Task 13: Final integration check

**Files:**
- No new files. Verification only.

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass (existing + 4 new test files).

- [ ] **Step 2: Start dev server and verify visually**

Run: `pnpm dev`

1. Open `http://localhost:3000` in browser
2. Enter a project description and run the research swarm
3. Wait for replay to complete
4. Verify: 5 coverage family cards appear at the bottom of the page
5. Verify: Cards show green/amber borders based on verification status
6. Verify: Out-of-scope families appear dimmed with "Not triggered"
7. Click an active card (e.g., "Hazmat")
8. Verify: Frosted overlay appears with synthesis detail on the left
9. Verify: Permit pane on the right shows form name, agency, and portal link
10. Verify: Close button (✕), Escape key, and backdrop click all close the overlay
11. For Air Quality card: verify tabs appear in the permit pane for multiple permits

- [ ] **Step 3: Verify no console errors**

Open browser devtools. Check for:
- No React key warnings
- No missing prop warnings
- No hydration mismatches

- [ ] **Step 4: Final commit (if any fixes needed)**

Only commit if the integration check revealed issues that needed fixing.
