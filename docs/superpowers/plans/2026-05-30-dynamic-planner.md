# Dynamic LLM Planner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `parseScope` extract real facts from the description with an LLM (no seeded fallback) and loosen `planResearch`'s family triggers, so the hypothesis/agent count varies with the actual project instead of being one of three seeded scopes.

**Architecture:** `parseScope` becomes async — OpenAI `submit_scope` tool → pure `scopePackFromFacts`; no key / error → pure `emptyScope`. `planResearch` (already fact-driven) gets its air trigger loosened so any added equipment activates air. CI determinism lives in pure unit tests; the golden eval becomes a key-gated, tolerant integration check that also asserts dynamism (complex run spawns more tasks than simple).

**Tech Stack:** TypeScript, OpenAI SDK (`gpt-4o-mini`), vitest. Base: `feat/real-modal-research` (extends PR #10).

**Spec:** `docs/superpowers/specs/2026-05-30-dynamic-planner-design.md`

---

## File Structure

- Modify: `src/lib/research/scope.ts` — async `parseScope` (LLM) + pure `scopePackFromFacts` + pure `emptyScope`; stop importing `scenarios.ts`.
- Test: `src/lib/research/__tests__/scope.test.ts` — `scopePackFromFacts`/`emptyScope` (pure).
- Modify: `src/lib/research/planner.ts` — loosen the air trigger.
- Test: `src/lib/research/__tests__/planner.test.ts` — variable hypothesis count by facts.
- Modify: `src/lib/research/run.ts` — `await parseScope(...)`.
- Modify: `src/evals/golden.ts` — key-gated + tolerant + dynamism assertion.

### Task 1: Pure scope builders (TDD)

**Files:**
- Modify: `src/lib/research/scope.ts`
- Test: `src/lib/research/__tests__/scope.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/research/__tests__/scope.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyScope, scopePackFromFacts } from "../scope";

describe("scopePackFromFacts", () => {
  it("normalizes extracted facts into a ScopePack", () => {
    const scope = scopePackFromFacts(
      {
        address: "Oxnard, CA",
        naics: "323111",
        equipment: [{ kind: "laser printer" }, { kind: "coating booth", description: "new" }],
        chemicals: [{ name: "flammable solvent", quantity: 60, unit: "gallons" }],
        waste_streams: [{ description: "spent solvent", kg_per_month: null }],
        disturbance_acres: 0,
        process_discharge: null,
      },
      "run_1",
      "desc",
    );
    expect(scope.facility.address).toBe("Oxnard, CA");
    expect(scope.facility.naics).toBe("323111");
    expect(scope.facility.sic).toBeNull();
    expect(scope.project_change.equipment.map((e) => e.kind)).toEqual(["laser printer", "coating booth"]);
    expect(scope.project_change.chemicals[0].quantity).toBe(60);
    expect(scope.project_change.waste_streams[0].kg_per_month).toBeNull();
    // missing facts flagged for the blocked dimensions
    const missing = scope.missing_facts.map((m) => m.field);
    expect(missing).toContain("waste_streams.kg_per_month");
    expect(missing).toContain("project_change.process_discharge");
  });

  it("drops malformed list entries and defaults unknowns to null", () => {
    const scope = scopePackFromFacts(
      { equipment: [{} as { kind: string }, { kind: "oven" }], chemicals: undefined },
      "run_2",
      "desc",
    );
    expect(scope.project_change.equipment.map((e) => e.kind)).toEqual(["oven"]);
    expect(scope.project_change.chemicals).toEqual([]);
    expect(scope.project_change.disturbance_acres).toBeNull();
  });
});

describe("emptyScope", () => {
  it("yields a fact-free scope that blocks everything", () => {
    const scope = emptyScope("run_3", "some description");
    expect(scope.project_change.equipment).toEqual([]);
    expect(scope.project_change.chemicals).toEqual([]);
    expect(scope.project_change.waste_streams).toEqual([]);
    expect(scope.facility.naics).toBeNull();
    expect(scope.facility.sic).toBeNull();
    expect(scope.project_change.description).toBe("some description");
    expect(scope.missing_facts.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/mac/Documents/antler-deep-research
pnpm vitest run src/lib/research/__tests__/scope.test.ts
```
Expected: FAIL — `scope.ts` has no `scopePackFromFacts`/`emptyScope` exports.

- [ ] **Step 3: Rewrite `scope.ts`**

Replace the entire contents of `src/lib/research/scope.ts` with:

```ts
import OpenAI from "openai";
import type { ResearchRunInput, ScopePack } from "./types";

export function createRunId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const JURISDICTION_STACK = ["SCAQMD", "California Water Boards", "Local CUPA"];

const SCOPE_SYSTEM =
  "You are an EHS intake scoping assistant for Southern California facility/project changes. " +
  "Extract structured facts from the description using the submit_scope tool. State only facts " +
  "that are present or clearly implied; never invent quantities, codes, or equipment. Use null " +
  "for unknown numeric/boolean values and omit unknown lists.";

const SUBMIT_SCOPE_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_scope",
    description: "Return the structured facts extracted from the project description.",
    parameters: {
      type: "object",
      properties: {
        address: { type: ["string", "null"] },
        naics: { type: ["string", "null"] },
        sic: { type: ["string", "null"] },
        equipment: {
          type: "array",
          items: {
            type: "object",
            properties: { kind: { type: "string" }, description: { type: "string" } },
            required: ["kind"],
          },
        },
        chemicals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: ["number", "null"] },
              unit: { type: ["string", "null"] },
              hazard: { type: "string" },
            },
            required: ["name"],
          },
        },
        waste_streams: {
          type: "array",
          items: {
            type: "object",
            properties: { description: { type: "string" }, kg_per_month: { type: ["number", "null"] } },
            required: ["description"],
          },
        },
        disturbance_acres: { type: ["number", "null"] },
        process_discharge: { type: ["boolean", "null"] },
      },
      required: [],
    },
  },
};

type ScopeFacts = {
  address?: string | null;
  naics?: string | null;
  sic?: string | null;
  equipment?: Array<{ kind?: unknown; description?: unknown }>;
  chemicals?: Array<{ name?: unknown; quantity?: unknown; unit?: unknown; hazard?: unknown }>;
  waste_streams?: Array<{ description?: unknown; kg_per_month?: unknown }>;
  disturbance_acres?: number | null;
  process_discharge?: boolean | null;
};

export function emptyScope(runId: string, description: string): ScopePack {
  return {
    run_id: runId,
    facility: {
      address: "Unspecified Southern California facility",
      jurisdiction_stack: JURISDICTION_STACK,
      naics: null,
      sic: null,
    },
    project_change: {
      description: description || "Unspecified project change.",
      equipment: [],
      chemicals: [],
      waste_streams: [],
      disturbance_acres: null,
      process_discharge: null,
    },
    missing_facts: [
      {
        field: "scope_extraction",
        why_needed: "Project facts could not be extracted (no LLM key or extraction failed).",
        blocks: ["air", "stormwater", "hazmat", "waste", "wastewater"],
      },
    ],
    assumptions: [],
  };
}

export function scopePackFromFacts(facts: ScopeFacts, runId: string, description: string): ScopePack {
  const equipment = (facts.equipment ?? [])
    .filter((e): e is { kind: string; description?: unknown } => !!e && typeof e.kind === "string")
    .map((e) => ({ kind: e.kind, description: typeof e.description === "string" ? e.description : "" }));

  const chemicals = (facts.chemicals ?? [])
    .filter((c): c is { name: string; quantity?: unknown; unit?: unknown; hazard?: unknown } => !!c && typeof c.name === "string")
    .map((c) => ({
      name: c.name,
      quantity: typeof c.quantity === "number" ? c.quantity : null,
      unit: typeof c.unit === "string" ? c.unit : null,
      ...(typeof c.hazard === "string" ? { hazard: c.hazard } : {}),
    }));

  const waste_streams = (facts.waste_streams ?? [])
    .filter((w): w is { description: string; kg_per_month?: unknown } => !!w && typeof w.description === "string")
    .map((w) => ({ description: w.description, kg_per_month: typeof w.kg_per_month === "number" ? w.kg_per_month : null }));

  const disturbance_acres = typeof facts.disturbance_acres === "number" ? facts.disturbance_acres : null;
  const process_discharge = typeof facts.process_discharge === "boolean" ? facts.process_discharge : null;
  const naics = typeof facts.naics === "string" ? facts.naics : null;
  const sic = typeof facts.sic === "string" ? facts.sic : null;

  const missing_facts: ScopePack["missing_facts"] = [];
  if (chemicals.some((c) => c.quantity === null)) {
    missing_facts.push({ field: "chemicals.quantity", why_needed: "HMBP threshold comparison needs the stored quantity.", blocks: ["hazmat"] });
  }
  if (waste_streams.some((w) => w.kg_per_month === null)) {
    missing_facts.push({ field: "waste_streams.kg_per_month", why_needed: "Hazardous waste generator category depends on monthly generation quantity.", blocks: ["waste"] });
  }
  if (!naics && !sic) {
    missing_facts.push({ field: "facility.naics_or_sic", why_needed: "Industrial stormwater coverage depends on SIC/NAICS.", blocks: ["stormwater"] });
  }
  if (process_discharge === null) {
    missing_facts.push({ field: "project_change.process_discharge", why_needed: "Wastewater pretreatment depends on whether process wastewater is discharged.", blocks: ["wastewater"] });
  }

  return {
    run_id: runId,
    facility: {
      address: typeof facts.address === "string" && facts.address ? facts.address : "Southern California facility",
      jurisdiction_stack: JURISDICTION_STACK,
      naics,
      sic,
    },
    project_change: { description: description || "Project change.", equipment, chemicals, waste_streams, disturbance_acres, process_discharge },
    missing_facts,
    assumptions: [{ claim: "Facility is in SCAQMD / California jurisdiction.", basis: "Southern-California-scoped demo.", confidence: 0.7 }],
  };
}

export async function parseScope(input: ResearchRunInput, runId: string): Promise<ScopePack> {
  const description = input.project_description.trim();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return emptyScope(runId, description);
  }
  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_INTAKE_MODEL ?? "gpt-4o-mini";
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SCOPE_SYSTEM },
        { role: "user", content: description },
      ],
      tools: [SUBMIT_SCOPE_TOOL],
      tool_choice: { type: "function", function: { name: "submit_scope" } },
      max_tokens: 800,
    });
    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") {
      return emptyScope(runId, description);
    }
    const facts = JSON.parse(toolCall.function.arguments || "{}") as ScopeFacts;
    return scopePackFromFacts(facts, runId, description);
  } catch (error) {
    console.error("parseScope LLM extraction failed; using empty scope:", error);
    return emptyScope(runId, description);
  }
}

export function projectFacts(scope: ScopePack): Record<string, unknown> {
  return {
    address: scope.facility.address,
    naics: scope.facility.naics,
    sic: scope.facility.sic,
    equipment: scope.project_change.equipment,
    chemicals: scope.project_change.chemicals,
    waste_streams: scope.project_change.waste_streams,
    disturbance_acres: scope.project_change.disturbance_acres,
    process_discharge: scope.project_change.process_discharge,
    missing_facts: scope.missing_facts,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd /Users/mac/Documents/antler-deep-research
pnpm vitest run src/lib/research/__tests__/scope.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/scope.ts src/lib/research/__tests__/scope.test.ts
git commit -m "feat(scope): LLM-driven parseScope + pure scopePackFromFacts/emptyScope"
```

### Task 2: Loosen the planner's air trigger (TDD)

**Files:**
- Modify: `src/lib/research/planner.ts`
- Test: `src/lib/research/__tests__/planner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/research/__tests__/planner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planResearch } from "../planner";
import { scopePackFromFacts } from "../scope";

describe("planResearch — count varies with facts", () => {
  it("equipment-only project activates air but not hazmat/waste", () => {
    const scope = scopePackFromFacts({ equipment: [{ kind: "oven" }], naics: "323111" }, "r1", "two ovens");
    const plan = planResearch(scope);
    const families = new Set(plan.research_graph.map((h) => h.family));
    expect(families.has("air")).toBe(true);
    expect(plan.research_graph.some((h) => h.id === "H-HAZMAT-HMBP")).toBe(false);
    expect(plan.research_graph.some((h) => h.id === "H-WASTE-GENERATOR")).toBe(false);
  });

  it("a richer project spawns strictly more hypotheses than the equipment-only one", () => {
    const lean = planResearch(scopePackFromFacts({ equipment: [{ kind: "oven" }], naics: "323111" }, "r1", "ovens"));
    const rich = planResearch(
      scopePackFromFacts(
        {
          equipment: [{ kind: "coating booth" }],
          chemicals: [{ name: "solvent", quantity: 60, unit: "gallons" }],
          waste_streams: [{ description: "spent solvent", kg_per_month: 10 }],
          naics: "323111",
          process_discharge: true,
        },
        "r2",
        "complex",
      ),
    );
    expect(rich.research_graph.length).toBeGreaterThan(lean.research_graph.length);
    expect(rich.research_graph.some((h) => h.id === "H-HAZMAT-HMBP")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/mac/Documents/antler-deep-research
pnpm vitest run src/lib/research/__tests__/planner.test.ts
```
Expected: FAIL on the first test — with the current hard-coded air trigger (`["coating_booth","process_equipment"]`), an `oven` does NOT activate air, so `families.has("air")` is false.

- [ ] **Step 3: Loosen the air trigger**

In `src/lib/research/planner.ts`, change the `air` branch of `coverageStatusFor`:
```ts
  if (family === "air") {
    const active = equipmentKinds.some((kind) => ["coating_booth", "process_equipment"].includes(kind));
    return {
      id: "CF-AIR",
      family,
      status: active ? "active" : "out_of_scope",
      reason: active ? "Project adds equipment that may emit air contaminants." : "No emitting equipment indicated.",
      project_facts_considered: equipmentKinds,
      missing_facts: []
    };
  }
```
to:
```ts
  if (family === "air") {
    const active = equipmentKinds.length > 0;
    return {
      id: "CF-AIR",
      family,
      status: active ? "active" : "out_of_scope",
      reason: active
        ? "Project adds equipment that may emit air contaminants."
        : "No equipment added that could emit air contaminants.",
      project_facts_considered: equipmentKinds,
      missing_facts: []
    };
  }
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd /Users/mac/Documents/antler-deep-research
pnpm vitest run src/lib/research/__tests__/planner.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/planner.ts src/lib/research/__tests__/planner.test.ts
git commit -m "feat(planner): air activates on any added equipment (variable count by facts)"
```

### Task 3: Await the now-async parseScope

**Files:**
- Modify: `src/lib/research/run.ts`

- [ ] **Step 1: Await parseScope**

In `src/lib/research/run.ts`, change:
```ts
  const scope_pack = parseScope(input, run_id);
```
to:
```ts
  const scope_pack = await parseScope(input, run_id);
```

- [ ] **Step 2: Verify typecheck + build + the full unit suite**

```bash
cd /Users/mac/Documents/antler-deep-research
pnpm typecheck && pnpm test 2>&1 | tail -4 && pnpm build 2>&1 | grep -E "Compiled successfully|Failed|error TS" | head -3
```
Expected: typecheck clean; all vitest tests pass (incl. the new scope + planner tests and the existing `toolCatalog`/`worker_core`/UI tests); build compiles.

- [ ] **Step 3: Commit**

```bash
git add src/lib/research/run.ts
git commit -m "feat(run): await the async parseScope"
```

### Task 4: Make the golden eval key-gated, tolerant, and dynamism-aware

**Files:**
- Modify: `src/evals/golden.ts`

- [ ] **Step 1: Rewrite the eval harness**

The eval now drives the LLM planner, so it needs a key and is non-deterministic. Skip cleanly without a key; with a key, assert mode-agnostic invariants plus the dynamism property (a richer project spawns more tasks than a simpler one).

Replace the entire contents of `src/evals/golden.ts` with:

```ts
import { runResearch } from "../lib/research/run";
import type { ResearchRun } from "../lib/research/types";

function groundedWhereVerified(run: ResearchRun): boolean {
  return run.determinations
    .filter((d) => d.verified)
    .every((d) => d.source_url.length > 0 && d.quote.length > 0);
}

function noInventedUnsupported(run: ResearchRun): boolean {
  return !run.determinations.some((d) => d.verified && d.project_fact.includes("missing"));
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.log("SKIP evals: the dynamic planner needs OPENAI_API_KEY (parseScope is LLM-driven).");
    return;
  }

  const simple = await runResearch({ project_description: "A small tenant improvement that adds two ovens. No chemicals, no waste, no discharge." });
  const complex = await runResearch({
    project_description:
      "A SoCal manufacturer adds a coating booth, stores 60 gallons of flammable solvent, generates spent solvent waste, and has NAICS 323111.",
  });

  const checks: Array<{ id: string; passed: boolean; details: string }> = [
    {
      id: "simple-defensible",
      passed: groundedWhereVerified(simple) && noInventedUnsupported(simple),
      details: `tasks=${simple.research_tasks.length} grounded=${groundedWhereVerified(simple)} invented=${!noInventedUnsupported(simple)}`,
    },
    {
      id: "complex-defensible",
      passed: groundedWhereVerified(complex) && noInventedUnsupported(complex),
      details: `tasks=${complex.research_tasks.length} grounded=${groundedWhereVerified(complex)} invented=${!noInventedUnsupported(complex)}`,
    },
    {
      id: "dynamism",
      passed: complex.research_tasks.length > simple.research_tasks.length,
      details: `complex tasks=${complex.research_tasks.length} > simple tasks=${simple.research_tasks.length}`,
    },
  ];

  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.id}: ${check.details}`);
  }
  if (checks.some((c) => !c.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Verify keyless skip + (if a key is set) a real run**

```bash
cd /Users/mac/Documents/antler-deep-research
pnpm eval                       # no key in env → prints SKIP, exits 0
```
Expected (keyless): `SKIP evals: the dynamic planner needs OPENAI_API_KEY ...`.

With a key (manual, optional): `OPENAI_API_KEY=sk-... pnpm eval` → three PASS lines, and the `dynamism` line shows `complex tasks > simple tasks` (proving the count now varies).

- [ ] **Step 3: Commit**

```bash
git add src/evals/golden.ts
git commit -m "test(eval): key-gated, tolerant golden + dynamism assertion (complex > simple tasks)"
```

## Self-Review

**Spec coverage:**
- LLM `parseScope` (always-LLM, no seeded fallback; key/error → emptyScope) → Task 1.
- Pure `scopePackFromFacts` / `emptyScope`, unit-tested → Task 1.
- Loosen `planResearch` triggers (air on any equipment) → Task 2.
- `await parseScope` → Task 3.
- CI determinism in unit tests; golden key-gated + tolerant + dynamism → Tasks 1, 2, 4.
- `scenarios.ts` retained for `toolCatalog.test` but unreferenced by `parseScope` → Task 1 (new `scope.ts` does not import it).

**Placeholder scan:** every code step has full file contents or exact before/after edits. The keyed golden run is the only manual/non-CI step, explicitly marked optional.

**Type/name consistency:** `scopePackFromFacts(facts, runId, description)` and `emptyScope(runId, description)` are defined in Task 1 and consumed by the tests (Tasks 1, 2) with matching signatures. `parseScope` returns `Promise<ScopePack>`, matched by `await` in Task 3. `planResearch(scope)` is unchanged in signature; only the air-trigger internals change. The emitted hypothesis IDs (`H-HAZMAT-HMBP`, etc.) are unchanged, so `SOURCE_POINTERS` (worker) stays valid. `ScopePack`/`ResearchRun` field names match `types.ts`.
```
