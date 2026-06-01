# Program Registry + Recall Floor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `programRegistry` (single source of truth for permits) and the deterministic `verifyDeterminationSet(scope, proposed)` recall floor that flags applicable permits the system never proposed, plus a parity test that keeps the registry and the EHS skills library from drifting.

**Architecture:** A pure data registry (`programRegistry.ts`) lists every permit program with a `triggeredBy(scope)` predicate. `completeness.ts` re-derives the expected program set from the registry x scope and diffs it against what was proposed; anything expected-but-not-proposed is a recall gap flagged `needs_review`. Both are pure, deterministic, and unit-testable with no LLM. This is the foundation the agentic orchestrator (separate follow-up plan) will sit on top of.

**Tech Stack:** TypeScript (strict), Vitest, the existing `src/lib/research` modules (`types.ts`, `planner.ts`, `skillForHypothesis.ts`, `skills/`).

**Base:** a new git worktree off `origin/main` (created at execution via `superpowers:using-git-worktrees`).

---

## Scope

**In this plan (deterministic foundation):**
1. `programRegistry.ts` — the single source of truth.
2. `completeness.ts` — `expectedProgramsForScope` + `verifyDeterminationSet` (the recall floor).
3. Registry <-> skills parity test (DRY guardrail).

**Deferred to a follow-up plan (`agentic-orchestrator.md`):** the LLM orchestrator tool-loop, `quarantine_injection` scoping to the orchestrator, and the recall-metric golden corpus. Those are an LLM subsystem and depend on this foundation existing first.

## File Structure

- Create `src/lib/research/programRegistry.ts` — `ProgramRegistryEntry` type, `PROGRAM_REGISTRY` array (seeded with the 9 known programs), `allPrograms()`, `programsForFamily(family)`.
- Create `src/lib/research/completeness.ts` — `expectedProgramsForScope(scope)`, `verifyDeterminationSet(scope, proposedIds)` returning `{ expected, proposed, missing }`.
- Create `src/lib/research/__tests__/programRegistry.test.ts` — registry parity (every planner hypothesis is covered; families valid).
- Create `src/lib/research/__tests__/completeness.test.ts` — recall floor (omitted active family is flagged; complete set has no gaps).
- Create `src/lib/research/__tests__/registrySkillsParity.test.ts` — every registry family has a skill; every skill maps to a registry family.

Each file has one responsibility. No existing files are modified in this plan (integration into `run.ts`/verifier is the follow-up).

---

## Task 1: ProgramRegistryEntry type + the registry

**Files:**
- Create: `src/lib/research/programRegistry.ts`
- Test: `src/lib/research/__tests__/programRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/research/__tests__/programRegistry.test.ts
import { describe, it, expect } from "vitest";
import { PROGRAM_REGISTRY, allPrograms, programsForFamily } from "../programRegistry";
import { planResearch } from "../planner";
import { parseScope } from "../scope"; // not used directly; ensures module graph compiles

describe("programRegistry", () => {
  it("has a unique id per entry", () => {
    const ids = PROGRAM_REGISTRY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every hypothesis the planner can emit", () => {
    // Build a maximal scope that activates all 5 current families.
    const scope = {
      run_id: "t",
      facility: { address: "x", jurisdiction_stack: ["SCAQMD"], naics: "332999", sic: "3499" },
      project_change: {
        description: "test",
        equipment: [{ kind: "coating_booth", description: "" }],
        chemicals: [{ name: "solvent", quantity: 60, unit: "gal" }],
        waste_streams: [{ description: "spent solvent", kg_per_month: 50 }],
        disturbance_acres: 2,
        process_discharge: true,
      },
      missing_facts: [],
      assumptions: [],
    } as const;
    const emitted = new Set(planResearch(scope as never).research_graph.map((h) => h.id));
    const covered = new Set(PROGRAM_REGISTRY.flatMap((p) => p.hypothesis_ids));
    const missing = [...emitted].filter((h) => !covered.has(h));
    expect(missing).toEqual([]);
  });

  it("programsForFamily filters by family", () => {
    expect(programsForFamily("air").length).toBeGreaterThan(0);
    expect(programsForFamily("air").every((p) => p.family === "air")).toBe(true);
  });

  it("allPrograms returns the full registry", () => {
    expect(allPrograms().length).toBe(PROGRAM_REGISTRY.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/research/__tests__/programRegistry.test.ts`
Expected: FAIL with "Cannot find module '../programRegistry'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/research/programRegistry.ts
// Single source of truth for permit programs. The verifier owns this list;
// completeness.ts re-derives the expected set from it. Family skills are
// projections of it (see registrySkillsParity.test.ts).
import type { CoverageFamily, ScopePack } from "./types";

export type ProgramRegistryEntry = {
  id: string;
  family: CoverageFamily;
  name: string;
  what_it_does: string;
  jurisdiction: string;
  authority_source_url: string;
  authority_rank: number;
  // The planner hypotheses that investigate this program.
  hypothesis_ids: string[];
  // Deterministic: does this project's scope make this program potentially applicable?
  // Mirrors the planner's family activation; the registry is the source of truth going forward.
  triggeredBy: (scope: ScopePack) => boolean;
};

const hasEquipment = (s: ScopePack) => s.project_change.equipment.length > 0;
const hasChemicals = (s: ScopePack) => s.project_change.chemicals.length > 0;
const hasWaste = (s: ScopePack) => s.project_change.waste_streams.length > 0;
const hasCodeOrAcres = (s: ScopePack) =>
  !!s.facility.sic || !!s.facility.naics || s.project_change.disturbance_acres !== null;
const dischargePossible = (s: ScopePack) => s.project_change.process_discharge !== false;

export const PROGRAM_REGISTRY: ProgramRegistryEntry[] = [
  {
    id: "scaqmd-permit-to-construct",
    family: "air",
    name: "SCAQMD Permit to Construct (Rule 201)",
    what_it_does: "Authorizes installing/modifying equipment that may emit air contaminants.",
    jurisdiction: "SCAQMD",
    authority_source_url: "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf",
    authority_rank: 1,
    hypothesis_ids: ["H-AIR-201", "H-AIR-VOC"],
    triggeredBy: hasEquipment,
  },
  {
    id: "scaqmd-rule-219-exemption",
    family: "air",
    name: "SCAQMD Rule 219 exemption",
    what_it_does: "Exempts listed equipment from written permit requirements if conditions are met.",
    jurisdiction: "SCAQMD",
    authority_source_url: "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-219.pdf",
    authority_rank: 1,
    hypothesis_ids: ["H-AIR-219"],
    triggeredBy: hasEquipment,
  },
  {
    id: "scaqmd-rule-222-registration",
    family: "air",
    name: "SCAQMD Rule 222 registration",
    what_it_does: "Registration path for specified equipment categories instead of a full permit.",
    jurisdiction: "SCAQMD",
    authority_source_url: "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-222.pdf",
    authority_rank: 1,
    hypothesis_ids: ["H-AIR-222"],
    triggeredBy: hasEquipment,
  },
  {
    id: "ca-industrial-general-permit",
    family: "stormwater",
    name: "California Industrial General Permit (IGP)",
    what_it_does: "Stormwater coverage triggered by industrial activity SIC/NAICS codes.",
    jurisdiction: "California Water Boards",
    authority_source_url: "https://www.waterboards.ca.gov/water_issues/programs/stormwater/industrial.html",
    authority_rank: 1,
    hypothesis_ids: ["H-STORM-IGP"],
    triggeredBy: hasCodeOrAcres,
  },
  {
    id: "ca-construction-general-permit",
    family: "stormwater",
    name: "California Construction General Permit (CGP)",
    what_it_does: "Stormwater coverage for construction disturbing one or more acres.",
    jurisdiction: "California Water Boards",
    authority_source_url: "https://www.waterboards.ca.gov/water_issues/programs/stormwater/construction.html",
    authority_rank: 1,
    hypothesis_ids: ["H-STORM-CGP"],
    triggeredBy: hasCodeOrAcres,
  },
  {
    id: "ca-hmbp",
    family: "hazmat",
    name: "California Hazardous Materials Business Plan (HMBP)",
    what_it_does: "Reporting plan triggered by hazardous material quantities at or above thresholds.",
    jurisdiction: "CalEPA / local CUPA",
    authority_source_url: "https://calepa.ca.gov/cupa/hazardous-materials-business-plan/",
    authority_rank: 1,
    hypothesis_ids: ["H-HAZMAT-HMBP"],
    triggeredBy: hasChemicals,
  },
  {
    id: "epa-hazwaste-generator",
    family: "waste",
    name: "EPA Hazardous Waste Generator Category",
    what_it_does: "Generator status (VSQG/SQG/LQG) based on monthly hazardous waste quantity.",
    jurisdiction: "US EPA / CA DTSC",
    authority_source_url: "https://www.epa.gov/hwgenerators/categories-hazardous-waste-generators",
    authority_rank: 1,
    hypothesis_ids: ["H-WASTE-GENERATOR"],
    triggeredBy: hasWaste,
  },
  {
    id: "epa-pretreatment",
    family: "wastewater",
    name: "EPA National Pretreatment Program",
    what_it_does: "Pretreatment requirements for industrial process wastewater discharges.",
    jurisdiction: "US EPA",
    authority_source_url: "https://www.epa.gov/npdes/national-pretreatment-program",
    authority_rank: 1,
    hypothesis_ids: ["H-WASTEWATER-PRETREATMENT"],
    triggeredBy: dischargePossible,
  },
];

export function allPrograms(): ProgramRegistryEntry[] {
  return PROGRAM_REGISTRY;
}

export function programsForFamily(family: CoverageFamily): ProgramRegistryEntry[] {
  return PROGRAM_REGISTRY.filter((p) => p.family === family);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/research/__tests__/programRegistry.test.ts`
Expected: PASS (4 tests). If the "covers every hypothesis" test fails, a planner hypothesis id is missing from a registry entry's `hypothesis_ids` — add it; do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/programRegistry.ts src/lib/research/__tests__/programRegistry.test.ts
git commit -m "feat(registry): programRegistry as single source of truth for permits"
```

---

## Task 2: completeness.ts — the recall floor

**Files:**
- Create: `src/lib/research/completeness.ts`
- Test: `src/lib/research/__tests__/completeness.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/research/__tests__/completeness.test.ts
import { describe, it, expect } from "vitest";
import { expectedProgramsForScope, verifyDeterminationSet } from "../completeness";
import type { ScopePack } from "../types";

function scopeWith(overrides: Partial<ScopePack["project_change"]> = {}): ScopePack {
  return {
    run_id: "t",
    facility: { address: "x", jurisdiction_stack: ["SCAQMD"], naics: null, sic: null },
    project_change: {
      description: "test",
      equipment: [{ kind: "coating_booth", description: "" }],
      chemicals: [{ name: "solvent", quantity: 60, unit: "gal" }],
      waste_streams: [],
      disturbance_acres: null,
      process_discharge: false,
      ...overrides,
    },
    missing_facts: [],
    assumptions: [],
  };
}

describe("verifyDeterminationSet (recall floor)", () => {
  it("flags an applicable program the orchestrator never proposed", () => {
    const scope = scopeWith(); // equipment + chemicals -> air + hazmat programs expected
    // Orchestrator proposed ONLY the air programs, dropped hazmat entirely.
    const proposed = ["scaqmd-permit-to-construct", "scaqmd-rule-219-exemption", "scaqmd-rule-222-registration"];
    const result = verifyDeterminationSet(scope, proposed);
    const missingIds = result.missing.map((p) => p.id);
    expect(missingIds).toContain("ca-hmbp"); // the wholly-missed family is caught
  });

  it("reports no gaps when the proposed set covers every expected program", () => {
    const scope = scopeWith();
    const proposed = expectedProgramsForScope(scope).map((p) => p.id);
    const result = verifyDeterminationSet(scope, proposed);
    expect(result.missing).toEqual([]);
  });

  it("does not expect programs whose family is out of scope", () => {
    const scope = scopeWith({ chemicals: [], waste_streams: [] }); // no hazmat, no waste
    const expectedIds = expectedProgramsForScope(scope).map((p) => p.id);
    expect(expectedIds).not.toContain("ca-hmbp");
    expect(expectedIds).not.toContain("epa-hazwaste-generator");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/research/__tests__/completeness.test.ts`
Expected: FAIL with "Cannot find module '../completeness'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/research/completeness.ts
// The recall floor. A verifier that only sees the proposed set is blind to a
// wholly-missed family; this re-derives the EXPECTED set from the registry x scope
// and diffs it against what was proposed. Anything expected-but-not-proposed is a
// recall gap (flag needs_review, never ship as "complete").
import type { ScopePack } from "./types";
import { PROGRAM_REGISTRY, type ProgramRegistryEntry } from "./programRegistry";

export function expectedProgramsForScope(scope: ScopePack): ProgramRegistryEntry[] {
  return PROGRAM_REGISTRY.filter((p) => {
    try {
      return p.triggeredBy(scope);
    } catch {
      // A broken trigger must never silently drop a program from the expected set.
      return true;
    }
  });
}

export type CompletenessResult = {
  expected: ProgramRegistryEntry[];
  proposed: string[];
  missing: ProgramRegistryEntry[];
};

export function verifyDeterminationSet(scope: ScopePack, proposedIds: string[]): CompletenessResult {
  const proposed = new Set(proposedIds);
  const expected = expectedProgramsForScope(scope);
  const missing = expected.filter((p) => !proposed.has(p.id));
  return { expected, proposed: proposedIds, missing };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/research/__tests__/completeness.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/completeness.ts src/lib/research/__tests__/completeness.test.ts
git commit -m "feat(completeness): deterministic recall floor over the program registry"
```

---

## Task 3: registry <-> skills parity (DRY guardrail)

**Files:**
- Test: `src/lib/research/__tests__/registrySkillsParity.test.ts`
- Reference (read-only): `src/lib/research/skillForHypothesis.ts`, `src/lib/research/skills/<id>/SKILL.md`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/research/__tests__/registrySkillsParity.test.ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROGRAM_REGISTRY } from "../programRegistry";
import { SKILL_FOR_HYPOTHESIS } from "../skillForHypothesis";

const SKILLS_DIR = join(__dirname, "..", "skills");

describe("registry <-> skills parity", () => {
  it("every registry hypothesis has a skill, and that skill dir exists", () => {
    for (const program of PROGRAM_REGISTRY) {
      for (const hid of program.hypothesis_ids) {
        const skillId = SKILL_FOR_HYPOTHESIS[hid];
        expect(skillId, `hypothesis ${hid} (program ${program.id}) has no skill mapping`).toBeTruthy();
        expect(
          existsSync(join(SKILLS_DIR, skillId, "SKILL.md")),
          `skill dir ${skillId} missing for ${hid}`,
        ).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/research/__tests__/registrySkillsParity.test.ts`
Expected: FAIL only if a registry hypothesis lacks a skill mapping. If it passes immediately (skills already cover all 9 hypotheses, which they do on `origin/main`), that is acceptable — the test is a regression guard. Confirm it ran (not zero tests).

- [ ] **Step 3: (only if failing) add the missing mapping**

If a hypothesis is unmapped, add it to `SKILL_FOR_HYPOTHESIS` in `src/lib/research/skillForHypothesis.ts` pointing at the correct family skill. Do not weaken the test.

- [ ] **Step 4: Run the full research test suite to confirm no regressions**

Run: `pnpm exec vitest run src/lib/research`
Expected: PASS (existing tests + the 3 new files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/__tests__/registrySkillsParity.test.ts
git commit -m "test(registry): parity guard so the registry and skills library can't drift"
```

---

## Task 4: typecheck the whole project

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: clean (no errors). The new files are additive; nothing else changes.

- [ ] **Step 2: Commit if any type fix was needed** (otherwise skip)

```bash
git add -A
git commit -m "chore: typecheck clean for program registry foundation"
```

---

## Follow-up (NOT in this plan)
- Wire `verifyDeterminationSet` into `run.ts` after synthesis so gaps surface as `needs_review` rows.
- The agentic orchestrator (TS tool-loop, injectable LLM seam, `quarantine_injection` scope) — its own plan.
- The recall-metric golden corpus (scope -> expected-set, recall %) — its own plan.

## Self-Review
- **Spec coverage:** registry (single source of truth) = Task 1; recall floor `verifyDeterminationSet(scope, proposed)` = Task 2; family-skill projection/parity = Task 3. Orchestrator + golden corpus explicitly deferred (scope note). All foundation items covered.
- **Placeholder scan:** every step has real code or a real command; no TBDs.
- **Type consistency:** `ProgramRegistryEntry` defined in Task 1 is imported unchanged in Task 2 and Task 3. `verifyDeterminationSet`/`expectedProgramsForScope` names match across completeness.ts and its test. `SKILL_FOR_HYPOTHESIS` is the existing export name in `skillForHypothesis.ts`. `triggeredBy` is consistent throughout.
