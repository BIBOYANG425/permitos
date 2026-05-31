# Durable Research Runtime (Supabase + Modal spawn + poll/Realtime) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a real (minutes-long) research run survive past the Vercel timeout by running the fan-out detached on Modal, persisting incremental state to Supabase, returning a `run_id` immediately, and finalizing on poll — opt-in via `RESEARCH_RUNTIME=durable`, with the synchronous path unchanged as the default.

**Architecture:** Only the fan-out is slow, so the fast TS steps stay in Node: `POST` runs `planRun` (parseScope+planResearch), writes a `queued` run to Supabase, and asks Modal to `spawn` the fan-out, returning `run_id`. Each Modal worker writes its `EvidenceBundle` to Supabase. `GET /:id` reads state and, once all bundles are in, runs the fast `finalizeRun` (verify+synthesize) and returns the full `ResearchRun`. A thin UI hook subscribes to Supabase Realtime and re-fetches.

**Tech Stack:** TypeScript (Next.js 15, vitest), `@supabase/supabase-js` (new), Python (Modal, `supabase` client), Supabase Postgres + Realtime.

**Spec:** `docs/superpowers/specs/2026-05-31-durable-runtime-supabase-design.md`

---

## File Structure
- `src/lib/research/store/supabaseStore.ts` (CREATE) — typed Supabase store, injectable client seam, env gating.
- `src/lib/research/store/__tests__/supabaseStore.test.ts` (CREATE) — fake-client unit tests.
- `src/lib/research/run.ts` (MODIFY) — split into `planRun` + `finalizeRun`; `runResearch` composes them (sync contract unchanged).
- `src/lib/research/__tests__/run.split.test.ts` (CREATE) — `planRun`+`finalizeRun` compose to `runResearch`.
- `src/lib/research/durable/durableRun.ts` (CREATE) — testable `enqueueRun`/`getRun` with injected deps.
- `src/lib/research/durable/__tests__/durableRun.test.ts` (CREATE) — fake store/start/fetch unit tests.
- `app/api/research/run/route.ts` (MODIFY) — durable branch (thin wrapper over `enqueueRun`).
- `app/api/research/run/[id]/route.ts` (CREATE) — GET (thin wrapper over `getRun`).
- `src/lib/research/modal/worker_core.py` (MODIFY) — pure `evidence_row(run_id, bundle)`.
- `src/lib/research/modal/worker_core_test.py` (MODIFY) — `evidence_row` test.
- `src/lib/research/modal/worker.py` (MODIFY) — `start_run` endpoint + `research_run` spawn fn + Supabase write; image += `supabase`.
- `supabase/migrations/0001_research_runtime.sql` (CREATE) — schema + RLS + Realtime.
- `src/lib/ui/useDurableRun.ts` (CREATE) — minimal Realtime+poll consumer.
- `docs/DURABLE_RUNTIME.md` (CREATE) — operator runbook.

**Test commands:** `pnpm test`, `pnpm typecheck`, `pnpm build`; `python3 src/lib/research/modal/worker_core_test.py`.

---

### Task 1: Supabase store module

**Files:** Create `src/lib/research/store/supabaseStore.ts`, `src/lib/research/store/__tests__/supabaseStore.test.ts`. Modify `package.json` (add dep).

- [ ] **Step 1: Add the dependency**

Run: `cd /Users/mac/Documents/antler-deep-research && pnpm add @supabase/supabase-js`
Expected: adds `@supabase/supabase-js` to `dependencies`.

- [ ] **Step 2: Write the failing test** — `src/lib/research/store/__tests__/supabaseStore.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { __setClientForTests, createRun, getRun, listEvidence, finalizeRun, updateStatus, isStoreConfigured } from "../supabaseStore";

// Minimal in-memory fake of the supabase-js surface this module uses.
function fakeClient() {
  const tables: Record<string, any[]> = { research_runs: [], research_evidence: [] };
  return {
    _tables: tables,
    from(table: string) {
      const rows = tables[table];
      const api: any = {
        _filters: [] as Array<[string, unknown]>,
        insert: (vals: any) => { rows.push(Array.isArray(vals) ? vals[0] : vals); return { error: null }; },
        upsert: (vals: any) => {
          const v = Array.isArray(vals) ? vals[0] : vals;
          const i = rows.findIndex((r) => r.run_id === v.run_id && r.hypothesis_id === v.hypothesis_id);
          if (i >= 0) rows[i] = v; else rows.push(v);
          return { error: null };
        },
        update: (vals: any) => ({ eq: (col: string, val: unknown) => { rows.filter((r) => r[col] === val).forEach((r) => Object.assign(r, vals)); return { error: null }; } }),
        select: () => api,
        eq(col: string, val: unknown) { api._filters.push([col, val]); return api; },
        order: () => api,
        async maybeSingle() { const r = rows.filter((x) => api._filters.every(([c, v]) => x[c] === v)); return { data: r[0] ?? null, error: null }; },
        then(resolve: any) { const r = rows.filter((x) => api._filters.every(([c, v]) => x[c] === v)); resolve({ data: r, error: null }); },
      };
      return api;
    },
  };
}

afterEach(() => { __setClientForTests(null); delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY; });

describe("supabaseStore", () => {
  it("isStoreConfigured reflects env presence", () => {
    expect(isStoreConfigured()).toBe(false);
    process.env.SUPABASE_URL = "u"; process.env.SUPABASE_SERVICE_KEY = "k";
    expect(isStoreConfigured()).toBe(true);
  });

  it("createRun + getRun round-trips a run record", async () => {
    __setClientForTests(fakeClient() as any);
    await createRun({ run_id: "r1", status: "queued", input: { project_description: "x" }, scope_pack: { a: 1 }, plan: { b: 2 }, jurisdiction_stack: ["SCAQMD"], task_count: 3, trace_events: [] });
    const run = await getRun("r1");
    expect(run?.status).toBe("queued");
    expect(run?.task_count).toBe(3);
  });

  it("listEvidence returns rows for a run; updateStatus + finalizeRun update the run", async () => {
    const c = fakeClient(); __setClientForTests(c as any);
    await createRun({ run_id: "r2", status: "queued", input: {}, scope_pack: {}, plan: {}, jurisdiction_stack: [], task_count: 1, trace_events: [] });
    c._tables.research_evidence.push({ run_id: "r2", hypothesis_id: "H-AIR-201", bundle: { hypothesis_id: "H-AIR-201" } });
    expect(await listEvidence("r2")).toHaveLength(1);
    await updateStatus("r2", "running");
    expect((await getRun("r2"))?.status).toBe("running");
    await finalizeRun("r2", { determinations: [{ x: 1 }], report_markdown: "md", trace_events: [] });
    const done = await getRun("r2");
    expect(done?.status).toBe("done");
    expect(done?.report_markdown).toBe("md");
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `cd /Users/mac/Documents/antler-deep-research && pnpm test -- supabaseStore` → FAIL (module missing).

- [ ] **Step 4: Implement** — `src/lib/research/store/supabaseStore.ts`:

```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type RunStatus = "queued" | "running" | "bundles_complete" | "done" | "failed" | "stalled";

export type RunRecord = {
  run_id: string;
  status: RunStatus;
  input: unknown;
  scope_pack: unknown;
  plan: unknown;
  jurisdiction_stack: string[];
  task_count: number;
  trace_events: unknown[];
  determinations?: unknown[] | null;
  report_markdown?: string | null;
};

let testClient: SupabaseClient | null = null;
export function __setClientForTests(c: SupabaseClient | null): void { testClient = c; }

export function isStoreConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

function client(): SupabaseClient {
  if (testClient) return testClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function createRun(record: RunRecord): Promise<void> {
  const { error } = await client().from("research_runs").insert({ ...record, updated_at: new Date().toISOString() });
  if (error) throw new Error(`createRun failed: ${error.message}`);
}

export async function getRun(run_id: string): Promise<RunRecord | null> {
  const { data, error } = await client().from("research_runs").select().eq("run_id", run_id).maybeSingle();
  if (error) throw new Error(`getRun failed: ${error.message}`);
  return (data as RunRecord) ?? null;
}

export async function listEvidence(run_id: string): Promise<Array<{ hypothesis_id: string; bundle: unknown }>> {
  const { data, error } = await client().from("research_evidence").select().eq("run_id", run_id);
  if (error) throw new Error(`listEvidence failed: ${error.message}`);
  return (data as Array<{ hypothesis_id: string; bundle: unknown }>) ?? [];
}

export async function updateStatus(run_id: string, status: RunStatus): Promise<void> {
  const { error } = await client().from("research_runs").update({ status, updated_at: new Date().toISOString() }).eq("run_id", run_id);
  if (error) throw new Error(`updateStatus failed: ${error.message}`);
}

export async function finalizeRun(
  run_id: string,
  result: { determinations: unknown[]; report_markdown: string; trace_events: unknown[] }
): Promise<void> {
  const { error } = await client().from("research_runs").update({
    status: "done", determinations: result.determinations, report_markdown: result.report_markdown,
    trace_events: result.trace_events, updated_at: new Date().toISOString(),
  }).eq("run_id", run_id);
  if (error) throw new Error(`finalizeRun failed: ${error.message}`);
}
```

- [ ] **Step 5: Run to verify pass** — `cd /Users/mac/Documents/antler-deep-research && pnpm test -- supabaseStore` → PASS (3 tests). Then `pnpm typecheck` clean.

- [ ] **Step 6: Commit**
```bash
cd /Users/mac/Documents/antler-deep-research && git add src/lib/research/store package.json pnpm-lock.yaml && git commit -m "feat(store): Supabase research-run store with injectable client seam"
```

---

### Task 2: Split `run.ts` into `planRun` + `finalizeRun`

The durable path needs the fast pre-step and post-step callable separately. The synchronous `runResearch` contract must not change.

**Files:** Modify `src/lib/research/run.ts`. Create `src/lib/research/__tests__/run.split.test.ts`.

- [ ] **Step 1: Write the failing test** — `src/lib/research/__tests__/run.split.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { planRun, finalizeRun } from "../run";
import { runLocalResearchPool } from "../workers";

describe("run.ts split", () => {
  it("planRun + pool + finalizeRun produces determinations for a fixture run", async () => {
    const planned = await planRun({ project_description: "A facility adds a coating booth and stores 60 gallons of flammable solvent." });
    expect(planned.run_id).toMatch(/^run_/);
    expect(planned.plan.research_tasks.length).toBeGreaterThan(0);
    const pool = await runLocalResearchPool(planned.plan.research_tasks, planned.plan.research_graph);
    const run = finalizeRun(planned.run_id, planned.scope_pack, planned.plan, pool.bundles, planned.trace_events);
    expect(run.determinations.length).toBe(planned.plan.research_graph.length);
    expect(run.report_markdown).toContain("Applicability Matrix");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `cd /Users/mac/Documents/antler-deep-research && pnpm test -- run.split` → FAIL (`planRun`/`finalizeRun` not exported).

- [ ] **Step 3: Implement** — refactor `src/lib/research/run.ts`. Extract two exported functions and have `runResearch` call them. Keep raindrop + the LLM-judge inside `runResearch` only (durable mode skips them — documented follow-up). Replace the body of `runResearch` (lines ~14 onward) with this structure (preserving all existing imports and the `runLlmJudgeOnHmbp`/`latestByHypothesis` helpers below):

```typescript
export type PlannedRun = {
  run_id: string;
  scope_pack: Awaited<ReturnType<typeof parseScope>>;
  plan: ReturnType<typeof planResearch>;
  trace_events: ReturnType<typeof trace>[];
};

export async function planRun(input: ResearchRunInput): Promise<PlannedRun> {
  const run_id = createRunId();
  const trace_events = [trace(run_id, "scope_agent", "scope", "running", "Parsing intake into ScopePack")];
  const scope_pack = await parseScope(input, run_id);
  trace_events.push(trace(run_id, "scope_agent", "scope", "done", "ScopePack created", run_id));
  const plan = planResearch(scope_pack);
  trace_events.push(
    trace(run_id, "orchestrator", "coverage", "done",
      `Inspected ${plan.coverage_family_statuses.length} coverage families and created ${plan.regulatory_angles.length} regulatory angles`),
    trace(run_id, "orchestrator", "task_graph", "done",
      `Created ${plan.research_graph.length} hypotheses and ${plan.research_tasks.length} source tasks`)
  );
  return { run_id, scope_pack, plan, trace_events };
}

export function finalizeRun(
  run_id: string,
  scope_pack: PlannedRun["scope_pack"],
  plan: PlannedRun["plan"],
  initialEvidence: EvidenceBundle[],
  baseTrace: ReturnType<typeof trace>[]
): ResearchRun {
  const trace_events = [...baseTrace];
  const evidence_bundles: EvidenceBundle[] = [...initialEvidence];
  const verification_verdicts: VerificationVerdict[] = [];
  const repair_tickets = [];

  for (const bundle of initialEvidence) {
    const verdict = verifyEvidence(scope_pack, bundle);
    verification_verdicts.push(verdict);
    if (verdict.verdict === "fail") {
      trace_events.push(trace(run_id, "verifier", "verification", "failed", `Verifier rejected ${bundle.hypothesis_id}`, bundle.hypothesis_id));
    }
    for (const ticket of verdict.repair_tickets) {
      repair_tickets.push(ticket);
      trace_events.push(trace(run_id, "orchestrator", "repair_ticket", "queued", ticket.observed_problem, ticket.ticket_id));
      const repairedEvidence = repairEvidence(scope_pack, ticket);
      evidence_bundles.push(repairedEvidence);
      const repairedVerdict = verifyEvidence(scope_pack, repairedEvidence);
      verification_verdicts.push(repairedVerdict);
      trace_events.push(trace(run_id, "verifier", "repair_verification", repairedVerdict.verdict === "pass" ? "done" : "needs_review",
        `Repair verdict for ${ticket.hypothesis_id}: ${repairedVerdict.verdict}`, ticket.hypothesis_id));
    }
  }

  const latestVerdicts = latestByHypothesis(verification_verdicts);
  const latestEvidence = latestByHypothesis(evidence_bundles);
  const synthesis = synthesize(scope_pack, plan.research_graph, plan.regulatory_angles, latestEvidence, latestVerdicts);
  trace_events.push(trace(run_id, "synthesis_agent", "matrix", "done", "Applicability matrix synthesized"));
  const status = synthesis.determinations.some((row) => row.review_flag) ? "needs_review" : "done";

  return {
    run_id, status,
    project_facts: projectFacts(scope_pack),
    jurisdiction_stack: scope_pack.facility.jurisdiction_stack,
    scope_pack,
    coverage_family_statuses: plan.coverage_family_statuses,
    regulatory_angles: plan.regulatory_angles,
    research_graph: plan.research_graph,
    research_tasks: plan.research_tasks,
    evidence_bundles: latestEvidence,
    verification_verdicts: latestVerdicts,
    repair_tickets,
    memory_updates: synthesis.memory_updates,
    determinations: synthesis.determinations,
    trace_events,
    report_markdown: synthesis.report_markdown,
  };
}

export async function runResearch(input: ResearchRunInput): Promise<ResearchRun> {
  const planned = await planRun(input);
  const { run_id } = planned;
  const interaction = raindrop.begin({
    eventId: run_id, event: "permit_research_run", userId: "permitpilot-demo", input: input.project_description,
    properties: { project_description_chars: input.project_description.length, demo_documents_count: input.demo_documents?.length ?? 0, use_modal: process.env.USE_MODAL === "1" },
  });
  const fanoutTrace = [...planned.trace_events,
    trace(run_id, "research_pool", "fanout", "running", `Launching ${planned.plan.research_tasks.length} local async workers`)];
  const poolResult = await runLocalResearchPool(planned.plan.research_tasks, planned.plan.research_graph);
  if (poolResult.degraded) {
    fanoutTrace.push(trace(run_id, "research_pool", "fanout", "needs_review", `⚠ Modal unreachable — using cached fixtures (${poolResult.degraded.reason})`));
  } else {
    fanoutTrace.push(trace(run_id, "research_pool", "fanout", "done", "Research worker pool returned evidence bundles"));
  }
  const result = finalizeRun(run_id, planned.scope_pack, planned.plan, poolResult.bundles, fanoutTrace);
  interaction.setProperties({
    status: result.status, hypotheses_count: planned.plan.research_graph.length, tasks_count: planned.plan.research_tasks.length,
    evidence_bundles_count: result.evidence_bundles.length, verdicts_count: result.verification_verdicts.length,
    repair_tickets_count: result.repair_tickets.length, determinations_count: result.determinations.length,
    needs_review_count: result.determinations.filter((d) => d.review_flag).length, trace_events_count: result.trace_events.length,
  });
  await runLlmJudgeOnHmbp(interaction, result.evidence_bundles, result.verification_verdicts, result.trace_events, run_id);
  void interaction.finish({ output: result.report_markdown.slice(0, 2000) }).catch(() => {});
  return result;
}
```

Keep the existing `runLlmJudgeOnHmbp` and `latestByHypothesis` functions and all imports as-is.

- [ ] **Step 4: Run** — `cd /Users/mac/Documents/antler-deep-research && pnpm test -- run.split` PASS; then `pnpm test` full suite green (the synchronous contract is preserved); `pnpm typecheck` clean.

- [ ] **Step 5: Commit**
```bash
cd /Users/mac/Documents/antler-deep-research && git add src/lib/research/run.ts src/lib/research/__tests__/run.split.test.ts && git commit -m "refactor(run): extract planRun + finalizeRun (sync contract unchanged)"
```

---

### Task 3: Durable orchestration module + API routes

**Files:** Create `src/lib/research/durable/durableRun.ts`, `src/lib/research/durable/__tests__/durableRun.test.ts`; modify `app/api/research/run/route.ts`; create `app/api/research/run/[id]/route.ts`.

- [ ] **Step 1: Write the failing test** — `src/lib/research/durable/__tests__/durableRun.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { enqueueRun, getDurableRun, type DurableDeps } from "../durableRun";

function deps(overrides: Partial<DurableDeps> = {}): DurableDeps {
  const runs: Record<string, any> = {};
  const evidence: Record<string, any[]> = {};
  return {
    planRun: async (input) => ({ run_id: "run_x", scope_pack: { facility: { jurisdiction_stack: ["SCAQMD"] } } as any, plan: { research_tasks: [{ task_id: "T1" }], research_graph: [{ id: "H-AIR-201", question: "q" }], coverage_family_statuses: [], regulatory_angles: [] } as any, trace_events: [] }),
    finalizeRun: (run_id) => ({ run_id, status: "done", determinations: [{ verified: true }], report_markdown: "md", trace_events: [] } as any),
    startModalRun: vi.fn(async () => {}),
    store: {
      createRun: async (r) => { runs[r.run_id] = { ...r }; },
      getRun: async (id) => runs[id] ?? null,
      listEvidence: async (id) => evidence[id] ?? [],
      updateStatus: async (id, s) => { runs[id].status = s; },
      finalizeRun: async (id, res) => { Object.assign(runs[id], { status: "done", ...res }); },
    } as any,
    _runs: runs, _evidence: evidence,
    ...overrides,
  } as any;
}

describe("durableRun", () => {
  it("enqueueRun plans, creates a queued run, asks Modal to spawn, returns run_id", async () => {
    const d = deps();
    const res = await enqueueRun({ project_description: "x" }, d);
    expect(res).toEqual({ run_id: "run_x", status: "queued" });
    expect((d as any)._runs["run_x"].status).toBe("queued");
    expect((d as any)._runs["run_x"].task_count).toBe(1);
    expect(d.startModalRun).toHaveBeenCalledOnce();
  });

  it("enqueueRun marks the run failed if Modal spawn throws", async () => {
    const d = deps({ startModalRun: vi.fn(async () => { throw new Error("boom"); }) });
    await expect(enqueueRun({ project_description: "x" }, d)).rejects.toThrow(/boom/);
    expect((d as any)._runs["run_x"].status).toBe("failed");
  });

  it("getDurableRun returns partial while incomplete", async () => {
    const d = deps();
    await enqueueRun({ project_description: "x" }, d);
    const got = await getDurableRun("run_x", d);
    expect(got.status).toBe("queued");
    expect((got as any).determinations).toBeUndefined();
  });

  it("getDurableRun finalizes once all bundles are present", async () => {
    const d = deps();
    await enqueueRun({ project_description: "x" }, d);
    (d as any)._evidence["run_x"] = [{ hypothesis_id: "H-AIR-201", bundle: { hypothesis_id: "H-AIR-201" } }];
    const got = await getDurableRun("run_x", d);
    expect(got.status).toBe("done");
    expect((got as any).determinations).toHaveLength(1);
  });

  it("getDurableRun 404s on unknown id", async () => {
    const d = deps();
    await expect(getDurableRun("nope", d)).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `cd /Users/mac/Documents/antler-deep-research && pnpm test -- durableRun` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/research/durable/durableRun.ts`:

```typescript
import type { ResearchRunInput, ResearchRun, EvidenceBundle } from "../types";
import { planRun, finalizeRun, type PlannedRun } from "../run";
import * as store from "../store/supabaseStore";

export type DurableDeps = {
  planRun: (input: ResearchRunInput) => Promise<PlannedRun>;
  finalizeRun: (run_id: string, scope_pack: PlannedRun["scope_pack"], plan: PlannedRun["plan"], evidence: EvidenceBundle[], baseTrace: PlannedRun["trace_events"]) => ResearchRun;
  startModalRun: (run_id: string, task_specs: unknown[]) => Promise<void>;
  store: Pick<typeof store, "createRun" | "getRun" | "listEvidence" | "updateStatus" | "finalizeRun">;
};

const realDeps: DurableDeps = { planRun, finalizeRun, startModalRun, store };

export async function enqueueRun(input: ResearchRunInput, deps: DurableDeps = realDeps): Promise<{ run_id: string; status: string }> {
  const planned = await deps.planRun(input);
  const task_specs = planned.plan.research_tasks.map((task) => {
    const h = planned.plan.research_graph.find((g) => g.id === task.hypothesis_id);
    return { task_id: task.task_id, hypothesis_id: task.hypothesis_id, question: h?.question ?? task.hypothesis_id, allowed_tools: task.allowed_tools, blocked_tools: task.blocked_tools, budget: task.budget };
  });
  await deps.store.createRun({
    run_id: planned.run_id, status: "queued", input, scope_pack: planned.scope_pack, plan: planned.plan,
    jurisdiction_stack: planned.scope_pack.facility.jurisdiction_stack, task_count: planned.plan.research_tasks.length, trace_events: planned.trace_events,
  });
  try {
    await deps.startModalRun(planned.run_id, task_specs);
  } catch (err) {
    await deps.store.updateStatus(planned.run_id, "failed");
    throw err;
  }
  return { run_id: planned.run_id, status: "queued" };
}

export async function getDurableRun(run_id: string, deps: DurableDeps = realDeps): Promise<ResearchRun | { run_id: string; status: string; task_count: number; bundles_count: number; trace_events: unknown[] }> {
  const run = await deps.store.getRun(run_id);
  if (!run) throw new Error(`Run not found: ${run_id}`);
  const evidence = await deps.store.listEvidence(run_id);
  const complete = run.status !== "done" && evidence.length >= run.task_count;
  if (complete) {
    const bundles = evidence.map((e) => e.bundle as EvidenceBundle);
    const result = deps.finalizeRun(run_id, run.scope_pack as PlannedRun["scope_pack"], run.plan as PlannedRun["plan"], bundles, (run.trace_events as PlannedRun["trace_events"]) ?? []);
    await deps.store.finalizeRun(run_id, { determinations: result.determinations, report_markdown: result.report_markdown, trace_events: result.trace_events });
    return result;
  }
  if (run.status === "done") {
    const bundles = evidence.map((e) => e.bundle as EvidenceBundle);
    return deps.finalizeRun(run_id, run.scope_pack as PlannedRun["scope_pack"], run.plan as PlannedRun["plan"], bundles, (run.trace_events as PlannedRun["trace_events"]) ?? []);
  }
  return { run_id, status: run.status, task_count: run.task_count, bundles_count: evidence.length, trace_events: (run.trace_events as unknown[]) ?? [] };
}

async function startModalRun(run_id: string, task_specs: unknown[]): Promise<void> {
  const endpoint = process.env.MODAL_START_RUN_ENDPOINT;
  const token = process.env.MODAL_RESEARCH_TOKEN;
  if (!endpoint || !token) throw new Error("Modal start_run endpoint not configured");
  const resp = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, run_id, task_specs }) });
  if (!resp.ok) throw new Error(`start_run HTTP ${resp.status}`);
}
```

- [ ] **Step 4: Run to verify pass** — `cd /Users/mac/Documents/antler-deep-research && pnpm test -- durableRun` → PASS (5 tests).

- [ ] **Step 5: Wire the routes.** Modify `app/api/research/run/route.ts` — add the durable branch at the top of `POST` (before the existing synchronous body):

```typescript
import { isStoreConfigured } from "@/lib/research/store/supabaseStore";
import { enqueueRun } from "@/lib/research/durable/durableRun";
```
and inside `POST`, after parsing `body`, before the synchronous `runResearch`:
```typescript
    if (process.env.RESEARCH_RUNTIME === "durable" && isStoreConfigured()) {
      const { run_id, status } = await enqueueRun({
        project_description: body.project_description ?? "",
        demo_documents: body.demo_documents ?? [],
      });
      return NextResponse.json({ run_id, status });
    }
```

Create `app/api/research/run/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDurableRun } from "@/lib/research/durable/durableRun";

export const maxDuration = 60;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const run = await getDurableRun(id);
    return NextResponse.json(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ run_id: id, status: "failed", error: message }, { status });
  }
}
```

- [ ] **Step 6: Verify + commit** — `pnpm test` green, `pnpm typecheck` clean, `pnpm build` OK.
```bash
cd /Users/mac/Documents/antler-deep-research && git add src/lib/research/durable app/api/research/run && git commit -m "feat(durable): enqueue/poll orchestration module + GET /:id route + durable POST branch"
```

---

### Task 4: Modal `start_run` + `research_run` writing to Supabase

**Files:** Modify `src/lib/research/modal/worker_core.py`, `src/lib/research/modal/worker_core_test.py`, `src/lib/research/modal/worker.py`.

- [ ] **Step 1: Write the failing test** — append to `src/lib/research/modal/worker_core_test.py` (and add `evidence_row` to the import):

```python
def test_evidence_row_maps_bundle_to_supabase_row():
    bundle = {"hypothesis_id": "H-AIR-201", "sources": [], "extracted_claims": [], "researcher_conclusion": "applies", "uncertainties": []}
    row = evidence_row("run_9", bundle)
    assert row["run_id"] == "run_9"
    assert row["hypothesis_id"] == "H-AIR-201"
    assert row["bundle"] == bundle
```

- [ ] **Step 2: Run to verify it fails** — `cd /Users/mac/Documents/antler-deep-research && python3 src/lib/research/modal/worker_core_test.py` → FAIL (`ImportError: evidence_row`).

- [ ] **Step 3: Implement** — add to `src/lib/research/modal/worker_core.py`:

```python
def evidence_row(run_id: str, bundle: dict) -> dict:
    """Pure mapping: EvidenceBundle -> research_evidence row (Supabase upsert payload)."""
    return {"run_id": run_id, "hypothesis_id": bundle.get("hypothesis_id", ""), "bundle": bundle}
```

- [ ] **Step 4: Run to verify pass** — `cd /Users/mac/Documents/antler-deep-research && python3 src/lib/research/modal/worker_core_test.py` → all pass.

- [ ] **Step 5: Extend `worker.py`** — add the Supabase write + the durable functions. Add `"supabase"` to the image `pip_install(...)` list. Add these (the `permitpilot-supabase` secret carries `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`):

```python
from worker_core import evidence_row  # add to the existing worker_core import

def _supabase():
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

def _write_bundle(sb, run_id: str, bundle: dict) -> None:
    sb.table("research_evidence").upsert(evidence_row(run_id, bundle)).execute()

@app.function(image=image, secrets=[
    modal.Secret.from_name("permitpilot-openai"),
    modal.Secret.from_name("permitpilot-supabase"),
], timeout=3600)
def research_run(run_id: str, task_specs: list) -> dict:
    sb = _supabase()
    sb.table("research_runs").update({"status": "running"}).eq("run_id", run_id).execute()
    written = 0
    # research_task is the existing per-task function; .map fans out across containers.
    for result in research_task.map(task_specs):
        _write_bundle(sb, run_id, result)
        written += 1
    sb.table("research_runs").update({"status": "bundles_complete"}).eq("run_id", run_id).execute()
    return {"run_id": run_id, "written": written}

@app.function(image=image, secrets=[
    modal.Secret.from_name("permitpilot-research"),
], timeout=60)
@modal.fastapi_endpoint(method="POST")
def start_run(payload: dict) -> dict:
    expected = os.environ.get("RESEARCH_TOKEN", "")
    if not expected or payload.get("token") != expected:
        return {"error": "unauthorized"}
    run_id = payload.get("run_id")
    task_specs = payload.get("task_specs") or []
    if not run_id:
        return {"error": "missing run_id"}
    research_run.spawn(run_id, task_specs)
    return {"run_id": run_id, "status": "queued"}
```

- [ ] **Step 6: Validate** — syntax + worker_core tests + modal import:
```bash
cd /Users/mac/Documents/antler-deep-research && python3 -c "import ast; ast.parse(open('src/lib/research/modal/worker.py').read()); print('syntax ok')"
cd /Users/mac/Documents/antler-deep-research && python3 src/lib/research/modal/worker_core_test.py
cd /Users/mac/Documents/antler-deep-research && (~/.local/bin/uv run --with modal --with 'fastapi[standard]' --with supabase python3 -c "import sys; sys.path.insert(0,'src/lib/research/modal'); import worker; print('import ok', bool(worker.start_run))" 2>&1 | tail -3)
```
Expected: `syntax ok`, python tests pass, `import ok`. (If the modal-aware import can't resolve `supabase` in the uv env, that's acceptable as DONE_WITH_CONCERNS — note it; syntax + worker_core tests must pass.)

- [ ] **Step 7: Commit**
```bash
cd /Users/mac/Documents/antler-deep-research && git add src/lib/research/modal/worker.py src/lib/research/modal/worker_core.py src/lib/research/modal/worker_core_test.py && git commit -m "feat(worker): start_run endpoint + research_run spawn writing bundles to Supabase"
```

---

### Task 5: Migration SQL + minimal UI hook + runbook

**Files:** Create `supabase/migrations/0001_research_runtime.sql`, `src/lib/ui/useDurableRun.ts`, `docs/DURABLE_RUNTIME.md`.

- [ ] **Step 1: Migration SQL** — create `supabase/migrations/0001_research_runtime.sql`:

```sql
create table if not exists research_runs (
  run_id text primary key,
  status text not null default 'queued',
  input jsonb,
  scope_pack jsonb,
  plan jsonb,
  jurisdiction_stack jsonb,
  task_count int not null default 0,
  determinations jsonb,
  report_markdown text,
  trace_events jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists research_evidence (
  run_id text not null references research_runs(run_id) on delete cascade,
  hypothesis_id text not null,
  bundle jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id, hypothesis_id)
);

alter table research_runs enable row level security;
alter table research_evidence enable row level security;

-- Read-only access for the public anon role so the UI can subscribe via Realtime.
-- All writes use the service key, which bypasses RLS.
create policy "anon read runs" on research_runs for select to anon using (true);
create policy "anon read evidence" on research_evidence for select to anon using (true);

alter publication supabase_realtime add table research_runs;
alter publication supabase_realtime add table research_evidence;
```

(No automated test — this is applied by the operator via the Supabase MCP `apply_migration` or the dashboard. A `psql`-syntax sanity check is optional.)

- [ ] **Step 2: UI hook** — create `src/lib/ui/useDurableRun.ts`:

```typescript
"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { ResearchRun } from "@/lib/research/types";

// Minimal durable-run consumer: poll GET /:id, and (if Supabase Realtime is configured)
// re-fetch immediately when an evidence/run row changes. Not the full streaming rewrite.
export function useDurableRun(runId: string | null, pollMs = 3000) {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const stopped = useRef(false);

  useEffect(() => {
    if (!runId) return;
    stopped.current = false;

    async function refetch() {
      const resp = await fetch(`/api/research/run/${runId}`);
      if (!resp.ok) return;
      const data = await resp.json();
      setStatus(data.status);
      if (data.determinations) setRun(data as ResearchRun);
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const sb = url && key ? createClient(url, key) : null;
    const channel = sb
      ? sb.channel(`run-${runId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "research_evidence", filter: `run_id=eq.${runId}` }, () => void refetch())
          .on("postgres_changes", { event: "*", schema: "public", table: "research_runs", filter: `run_id=eq.${runId}` }, () => void refetch())
          .subscribe()
      : null;

    void refetch();
    const timer = setInterval(() => { if (!stopped.current && status !== "done") void refetch(); }, pollMs);

    return () => { stopped.current = true; clearInterval(timer); if (sb && channel) void sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return { run, status };
}
```

- [ ] **Step 3: Runbook** — create `docs/DURABLE_RUNTIME.md`:

```markdown
# Durable research runtime (Supabase + Modal)

Opt-in long-run path. Default stays synchronous (no setup needed). Turn on with `RESEARCH_RUNTIME=durable`.

## Provision Supabase (project gcfhexotjfmowlbzcggd)
1. Authenticate the Supabase MCP: `claude /mcp` → supabase → Authenticate (interactive terminal).
2. Apply `supabase/migrations/0001_research_runtime.sql` (Supabase MCP `apply_migration`, or paste in the SQL editor).

## Environment
| Name | Where | Value |
|------|-------|-------|
| `RESEARCH_RUNTIME` | Vercel + local | `durable` |
| `SUPABASE_URL` | Node (server) | project URL |
| `SUPABASE_SERVICE_KEY` | Node (server) | service-role key (never `NEXT_PUBLIC_`) |
| `NEXT_PUBLIC_SUPABASE_URL` | UI | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | UI | anon key (read-only via RLS) |
| `MODAL_START_RUN_ENDPOINT` | Node (server) | the deployed Modal `start_run` URL |
| `MODAL_RESEARCH_TOKEN` | Node + Modal secret | shared bearer token |

Modal secret `permitpilot-supabase` = `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. Then `modal deploy src/lib/research/modal/worker.py` (publishes `start_run`), copy its URL into `MODAL_START_RUN_ENDPOINT`, and redeploy Vercel.

## Flow
`POST /api/research/run` → `{run_id, status:"queued"}` immediately. The fan-out runs detached on Modal,
writing each `EvidenceBundle` to `research_evidence`. `GET /api/research/run/:id` returns progress and,
once all bundles are in, the finalized `ResearchRun`. The UI `useDurableRun(run_id)` hook polls + subscribes
to Realtime. With `RESEARCH_RUNTIME` unset, everything behaves as the synchronous demo path.
```

- [ ] **Step 4: Verify + commit** — `pnpm typecheck` clean (the hook compiles), `pnpm build` OK.
```bash
cd /Users/mac/Documents/antler-deep-research && git add supabase/migrations src/lib/ui/useDurableRun.ts docs/DURABLE_RUNTIME.md && git commit -m "feat(durable): Supabase migration + minimal useDurableRun hook + runbook"
```

---

## Final Verification (after all tasks)
```bash
cd /Users/mac/Documents/antler-deep-research && pnpm test && pnpm typecheck && pnpm build
cd /Users/mac/Documents/antler-deep-research && python3 src/lib/research/modal/worker_core_test.py
```
All green = ready for final review + PR. Live durable behavior (Success Criteria 1) is validated by the
operator after Supabase provisioning + `modal deploy`: `POST` returns a `run_id`, evidence rows appear,
`GET /:id` finalizes.
```
