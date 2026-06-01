# Agentic Orchestration Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed, deterministic research fan-out with a model-driven orchestration tier that decides which planned hypotheses to investigate and spawns researchers via tools — while keeping the mechanical verifier and recall floor as an untouched grounding backstop.

**Architecture:** The deterministic planner (`planResearch`) still emits *candidate* hypotheses. In live/modal mode a new bounded tool-calling loop (`runOrchestrationAgent`) lets a real model choose which candidates to investigate and spawn researchers for them (inter-agent comms via `spawn_researchers`). The model can prune but never weakens safety: the existing recall floor in `finalizeRun` re-derives the registry-expected program set and flags anything the model skipped as `needs_review`. Fixture mode stays 100% deterministic (no model, no network), so demo/offline runs and the existing test suite are unaffected.

**Tech Stack:** TypeScript (ESM), Vitest, OpenAI chat-completions tool-calling (already used by `liveWorker.ts`). No new dependencies.

---

## Why this exists (context for a cold reader)

Today `runResearch` in `src/lib/research/run.ts` is a deterministic pipeline: `planResearch` computes a fixed hypothesis/task graph, `runLocalResearchPool` runs **one researcher per task**, then verify → repair → synthesize → recall floor. The only model "reasoning" at the orchestration altitude (`runOrchestrationBriefing`) is explicitly additive and *changes nothing*. So the model never decides the shape of a run — the TypeScript does. This was contrasted against a model-driven agent (cc-crossbeam) where the model owns the loop and spawns subagents; the takeaway was: move orchestration *control* into the model, but keep this project's deterministic grounding backstop (verifier + recall floor + allowlist + verbatim-quote grounding), which the reference agent lacks.

This plan implements the smallest complete version of that shift: **the model chooses the investigation set and spawns researchers; the recall floor backstops any wrongful pruning.**

Key facts already true in the codebase (do not re-derive):
- `src/lib/research/toolCatalog.ts` already declares orchestration tools (`spawn_subagents`, `wait_for_subagents`, scoped to `planner`/`system`) — they were simply never wired to a loop.
- `src/lib/research/completeness.ts` `verifyDeterminationSet(scope, proposedIds)` is the recall floor. `finalizeRun` already calls it and flags expected-but-uninvestigated programs as `needs_review`.
- `src/lib/research/__tests__/run.recallFloor.test.ts` already simulates "an orchestrator that dropped the hazmat family" and asserts the floor catches it. This plan makes that scenario real.
- `src/lib/research/liveResearchAgent.ts` exports the loop primitives we reuse: `LlmFn`, `AgentMessage`, `ToolSchema`.
- `src/lib/research/liveWorker.ts` builds the real OpenAI `LlmFn` via `makeLlmFn(client)` (currently NOT exported) and runs the per-hypothesis pool.

## Non-goals (explicitly out of scope for this plan)
- Do **not** modify the verifier, repair, synthesis, or recall-floor logic. They are the backstop.
- Do **not** add hypothesis *discovery* (the model inventing new programs beyond the planner's candidates). That is a follow-up — it requires registry/staging work.
- Do **not** change fixture mode behavior. Fixture runs must stay deterministic.
- Do **not** remove `runOrchestrationBriefing` yet (it is harmless and additive). A follow-up can fold it into the agent.

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/research/prompts.ts` | Prompt index. Add the orchestration agent's tool-loop task frame (reuses the existing `ORCHESTRATION_SYSTEM_PROMPT`). | Modify |
| `src/lib/research/orchestrationAgent.ts` | Pure, dependency-injected orchestration loop + its two tool schemas. Decides the investigation set, spawns researchers, returns gathered bundles. No I/O. | Create |
| `src/lib/research/liveOrchestrator.ts` | Production wiring: real OpenAI `LlmFn` + `runLocalResearchPool` as the spawn function. Fail-soft (returns `null` to trigger deterministic fallback). | Create |
| `src/lib/research/liveWorker.ts` | Export `makeLlmFn` so the live orchestrator reuses the exact OpenAI wiring (DRY). | Modify |
| `src/lib/research/run.ts` | Add pure `prunePlanToInvestigated`; in `runResearch`, route live/modal mode through the agent with deterministic fallback; pass the pruned plan to `finalizeRun`. | Modify |
| `src/lib/research/__tests__/orchestrationAgent.test.ts` | Unit tests for the loop with fake `llmFn`/`spawnFn`. | Create |
| `src/lib/research/__tests__/run.orchestration.test.ts` | Tests `prunePlanToInvestigated` + the recall-floor backstop on a pruned plan. | Create |

---

## Task 1: Orchestration agent task-frame prompt

**Files:**
- Modify: `src/lib/research/prompts.ts`
- Test: `src/lib/research/__tests__/orchestrationAgent.test.ts` (created in Task 2; the prompt assertion lives there)

- [ ] **Step 1: Add the instruction constant**

Append to `src/lib/research/prompts.ts` (after the existing `ORCHESTRATION_SYSTEM_PROMPT` block):

```ts
// The orchestration AGENT task frame: the same right-altitude system prompt, plus the
// explicit tool-loop contract. Reused as the `system` message by runOrchestrationAgent.
// Distinct from ORCHESTRATION_SYSTEM_PROMPT (which steers the additive briefing) only in
// that it tells the model HOW to act via tools — the safety rules are identical.
export const ORCHESTRATION_AGENT_INSTRUCTION = `${ORCHESTRATION_SYSTEM_PROMPT}

You drive this run by calling tools:
1. The deterministic planner has proposed a set of CANDIDATE hypotheses (one per candidate permit program).
2. Decide which to investigate. Skip a candidate ONLY when the project facts make it clearly irrelevant.
3. Call spawn_researchers with the hypothesis ids you want investigated. You may call it multiple times — for example to batch by family, or to react to what earlier researchers returned.
4. When every hypothesis you intend to investigate has been spawned, call submit_plan with a one-paragraph rationale.

You never weaken the grounding backstop: every returned bundle is still judged by the mechanical verifier, and any program you skip that the registry expects for this scope is surfaced as needs_review by the recall floor. When unsure, investigate the candidate.`;
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors. (`ORCHESTRATION_SYSTEM_PROMPT` is already defined above in the same file.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/research/prompts.ts
git commit -m "feat(orchestration): add agentic orchestration task-frame prompt"
```

---

## Task 2: Pure orchestration agent loop

**Files:**
- Create: `src/lib/research/orchestrationAgent.ts`
- Test: `src/lib/research/__tests__/orchestrationAgent.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/research/__tests__/orchestrationAgent.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  runOrchestrationAgent,
  ORCHESTRATION_TOOL_SCHEMAS,
  type SpawnFn,
} from "../orchestrationAgent";
import { ORCHESTRATION_AGENT_INSTRUCTION } from "../prompts";
import type { EvidenceBundle, ResearchHypothesis } from "../types";
import type { LlmFn } from "../liveResearchAgent";

function hyp(id: string, family: ResearchHypothesis["family"]): ResearchHypothesis {
  return {
    id,
    angle_id: `${id}-angle`,
    family,
    question: `Does ${id} apply?`,
    required_facts: [],
    expected_source_type: "regulation",
    success_criteria: [],
    dependencies: [],
  };
}

function bundle(id: string, conclusion: EvidenceBundle["researcher_conclusion"] = "applies"): EvidenceBundle {
  return {
    hypothesis_id: id,
    sources: [{ url: "https://x", source_name: "x", authority_rank: 1, fetched_at: "t", content_hash: "h", effective_date: null, quote: "q" }],
    extracted_claims: [],
    researcher_conclusion: conclusion,
    uncertainties: [],
  };
}

const candidates = [hyp("H-AIR-201", "air"), hyp("H-HAZMAT-HMBP", "hazmat")];

// A scripted llmFn that returns a fixed sequence of tool-call turns.
function scriptedLlm(turns: Array<{ name: string; arguments: Record<string, unknown> }[]>): LlmFn {
  let i = 0;
  return async () => {
    const calls = turns[i] ?? [];
    i += 1;
    return {
      content: null,
      tool_calls: calls.map((c, n) => ({ id: `call-${i}-${n}`, name: c.name, arguments: c.arguments })),
    };
  };
}

describe("runOrchestrationAgent", () => {
  it("investigates only the subset the model chooses and returns those bundles", async () => {
    const spawnFn: SpawnFn = vi.fn(async (ids) => ids.map((id) => bundle(id)));
    const llmFn = scriptedLlm([
      [{ name: "spawn_researchers", arguments: { hypothesis_ids: ["H-AIR-201"] } }],
      [{ name: "submit_plan", arguments: { rationale: "hazmat irrelevant" } }],
    ]);

    const result = await runOrchestrationAgent(candidates, { llmFn, spawnFn });

    expect(spawnFn).toHaveBeenCalledWith(["H-AIR-201"]);
    expect(result.investigated_hypothesis_ids).toEqual(["H-AIR-201"]);
    expect(result.evidence_bundles).toHaveLength(1);
    expect(result.notes).toContain("hazmat irrelevant");
  });

  it("rejects ids that are not candidates and dedupes repeated spawns", async () => {
    const spawnFn: SpawnFn = vi.fn(async (ids) => ids.map((id) => bundle(id)));
    const llmFn = scriptedLlm([
      [{ name: "spawn_researchers", arguments: { hypothesis_ids: ["H-AIR-201", "H-BOGUS"] } }],
      [{ name: "spawn_researchers", arguments: { hypothesis_ids: ["H-AIR-201"] } }], // dup
      [{ name: "submit_plan", arguments: { rationale: "done" } }],
    ]);

    const result = await runOrchestrationAgent(candidates, { llmFn, spawnFn });

    // Only the valid id is ever spawned, and only once.
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(spawnFn).toHaveBeenCalledWith(["H-AIR-201"]);
    expect(result.investigated_hypothesis_ids).toEqual(["H-AIR-201"]);
  });

  it("fail-soft: returns empty when the model never spawns", async () => {
    const spawnFn: SpawnFn = vi.fn(async (ids) => ids.map((id) => bundle(id)));
    const llmFn = scriptedLlm([[{ name: "submit_plan", arguments: { rationale: "nothing" } }]]);

    const result = await runOrchestrationAgent(candidates, { llmFn, spawnFn });

    expect(spawnFn).not.toHaveBeenCalled();
    expect(result.investigated_hypothesis_ids).toEqual([]);
    expect(result.evidence_bundles).toEqual([]);
  });

  it("stops at the call budget without looping forever", async () => {
    const spawnFn: SpawnFn = vi.fn(async (ids) => ids.map((id) => bundle(id)));
    // llmFn that never submits and never returns tool calls -> loop must break on empty calls.
    const llmFn: LlmFn = async () => ({ content: "thinking", tool_calls: [] });

    const result = await runOrchestrationAgent(candidates, { llmFn, spawnFn, maxCalls: 3 });

    expect(result.investigated_hypothesis_ids).toEqual([]);
  });

  it("exposes spawn_researchers and submit_plan schemas", () => {
    expect(Object.keys(ORCHESTRATION_TOOL_SCHEMAS).sort()).toEqual(["spawn_researchers", "submit_plan"]);
    expect(ORCHESTRATION_AGENT_INSTRUCTION).toMatch(/spawn_researchers/);
    expect(ORCHESTRATION_AGENT_INSTRUCTION).toMatch(/recall floor/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/research/__tests__/orchestrationAgent.test.ts`
Expected: FAIL — `Cannot find module '../orchestrationAgent'`.

- [ ] **Step 3: Implement the agent**

Create `src/lib/research/orchestrationAgent.ts`:

```ts
// Model-driven orchestration tier (peer of liveResearchAgent.ts, one altitude up).
//
// The deterministic planner (planResearch) emits CANDIDATE hypotheses. This bounded
// tool-calling loop lets a real model decide WHICH candidates to investigate and spawn
// researchers for them — the first place model control replaces a fixed TS fan-out.
// It can prune but never weakens the grounding backstop: the mechanical verifier still
// judges every bundle, and the recall floor (completeness.ts, wired in finalizeRun)
// flags any expected program the model skipped as needs_review. Pure + dependency-
// injected so it is unit-testable with fakes (no network, no OpenAI import here).
import type { EvidenceBundle, ResearchHypothesis } from "./types";
import type { AgentMessage, LlmFn, ToolSchema } from "./liveResearchAgent";
import { ORCHESTRATION_AGENT_INSTRUCTION } from "./prompts";

// Spawns bounded researchers for the given hypothesis ids and returns their bundles.
// Production impl is runLocalResearchPool (workers.ts), injected by liveOrchestrator.ts.
export type SpawnFn = (hypothesisIds: string[]) => Promise<EvidenceBundle[]>;

export type OrchestrationAgentResult = {
  investigated_hypothesis_ids: string[];
  evidence_bundles: EvidenceBundle[];
  notes: string[];
};

export const ORCHESTRATION_TOOL_SCHEMAS: Record<string, ToolSchema> = {
  spawn_researchers: {
    type: "function",
    function: {
      name: "spawn_researchers",
      description:
        "Spawn bounded research subagents for the given candidate hypothesis ids. Returns each researcher's distilled conclusion (not the full evidence). Call it once per batch you want investigated; you may call it multiple times.",
      parameters: {
        type: "object",
        properties: {
          hypothesis_ids: { type: "array", items: { type: "string" } },
        },
        required: ["hypothesis_ids"],
      },
    },
  },
  submit_plan: {
    type: "function",
    function: {
      name: "submit_plan",
      description:
        "Finish orchestration once every hypothesis you intend to investigate has been spawned. Terminal — ends the run.",
      parameters: {
        type: "object",
        properties: { rationale: { type: "string" } },
        required: ["rationale"],
      },
    },
  },
};

function candidateSummary(candidates: ResearchHypothesis[]): string {
  const lines = candidates.map((h) => `- ${h.id} [${h.family}] ${h.question}`);
  return [
    "Candidate hypotheses proposed by the deterministic planner:",
    ...lines,
    "",
    "Spawn researchers for the ones to investigate, then submit_plan.",
  ].join("\n");
}

export async function runOrchestrationAgent(
  candidates: ResearchHypothesis[],
  deps: { llmFn: LlmFn; spawnFn: SpawnFn; maxCalls?: number },
): Promise<OrchestrationAgentResult> {
  const validIds = new Set(candidates.map((h) => h.id));
  const maxCalls = deps.maxCalls ?? 6;
  const tools = Object.values(ORCHESTRATION_TOOL_SCHEMAS);
  const messages: AgentMessage[] = [
    { role: "system", content: ORCHESTRATION_AGENT_INSTRUCTION },
    { role: "user", content: candidateSummary(candidates) },
  ];

  const bundlesById = new Map<string, EvidenceBundle>();
  const notes: string[] = [];

  for (let i = 0; i < maxCalls; i++) {
    const resp = await deps.llmFn(messages, tools);
    const calls = resp.tool_calls ?? [];
    messages.push({ role: "assistant", content: resp.content, tool_calls: calls });
    if (calls.length === 0) break;

    let submitted = false;
    for (const call of calls) {
      const name = call.name ?? "";
      const args = call.arguments ?? {};
      const callId = call.id ?? "";

      if (name === "submit_plan") {
        if (typeof args.rationale === "string") notes.push(args.rationale);
        submitted = true;
        messages.push({ role: "tool", tool_call_id: callId, name, content: JSON.stringify({ ok: true }) });
        continue;
      }

      if (name === "spawn_researchers") {
        const requested = Array.isArray(args.hypothesis_ids) ? args.hypothesis_ids.map(String) : [];
        const accepted = requested.filter((id) => validIds.has(id) && !bundlesById.has(id));
        const rejected = requested.filter((id) => !validIds.has(id));
        if (accepted.length === 0) {
          messages.push({
            role: "tool",
            tool_call_id: callId,
            name,
            content: JSON.stringify({ error: "no new valid hypothesis ids", rejected }),
          });
          continue;
        }
        const spawned = await deps.spawnFn(accepted);
        for (const b of spawned) bundlesById.set(b.hypothesis_id, b);
        const investigated = accepted.map((id) => {
          const b = bundlesById.get(id);
          return {
            hypothesis_id: id,
            conclusion: b?.researcher_conclusion ?? "needs_review",
            grounded: !!b && b.sources.length > 0,
          };
        });
        messages.push({ role: "tool", tool_call_id: callId, name, content: JSON.stringify({ investigated, rejected }) });
        continue;
      }

      messages.push({ role: "tool", tool_call_id: callId, name, content: JSON.stringify({ error: `unknown tool '${name}'` }) });
    }
    if (submitted) break;
  }

  return {
    investigated_hypothesis_ids: [...bundlesById.keys()],
    evidence_bundles: [...bundlesById.values()],
    notes,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/research/__tests__/orchestrationAgent.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/orchestrationAgent.ts src/lib/research/__tests__/orchestrationAgent.test.ts
git commit -m "feat(orchestration): pure model-driven agent loop that spawns researchers"
```

---

## Task 3: Live wiring (real OpenAI + real research pool)

**Files:**
- Modify: `src/lib/research/liveWorker.ts` (export `makeLlmFn`)
- Create: `src/lib/research/liveOrchestrator.ts`

- [ ] **Step 1: Export `makeLlmFn` from `liveWorker.ts`**

In `src/lib/research/liveWorker.ts`, change the declaration (currently around line 66) from:

```ts
function makeLlmFn(client: OpenAI): LlmFn {
```

to:

```ts
export function makeLlmFn(client: OpenAI): LlmFn {
```

- [ ] **Step 2: Create the live orchestrator wiring**

Create `src/lib/research/liveOrchestrator.ts`:

```ts
// Production wiring for the agentic orchestration tier (orchestrationAgent.ts):
//   - llmFn   = the same OpenAI tool-calling client used by the researchers (makeLlmFn).
//   - spawnFn = runLocalResearchPool over the planned tasks/hypotheses for the chosen ids,
//               so spawned researchers run on whatever executor the run is configured for
//               (live or modal) and inherit the catalog-governed per-hypothesis loop.
//
// Fail-soft: returns null when there is no API key, when the agent errored, or when the
// model investigated nothing — the caller (run.ts) then falls back to the deterministic
// full fan-out. Dynamically imported by run.ts only in non-fixture mode, so its OpenAI
// import never loads in fixture-mode tests.
import OpenAI from "openai";
import { makeLlmFn } from "./liveWorker";
import { runOrchestrationAgent, type OrchestrationAgentResult, type SpawnFn } from "./orchestrationAgent";
import { runLocalResearchPool } from "./workers";
import type { PlannedRun } from "./run";

export async function runOrchestrationAgentLive(planned: PlannedRun): Promise<OrchestrationAgentResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey });
  const llmFn = makeLlmFn(client);
  const taskById = new Map(planned.plan.research_tasks.map((t) => [t.hypothesis_id, t]));
  const hypById = new Map(planned.plan.research_graph.map((h) => [h.id, h]));

  const spawnFn: SpawnFn = async (ids) => {
    const tasks = ids.map((id) => taskById.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
    const hyps = ids.map((id) => hypById.get(id)).filter((h): h is NonNullable<typeof h> => !!h);
    const result = await runLocalResearchPool(tasks, hyps);
    return result.bundles;
  };

  try {
    const result = await runOrchestrationAgent(planned.plan.research_graph, { llmFn, spawnFn });
    return result.investigated_hypothesis_ids.length > 0 ? result : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors. (`PlannedRun` is exported from `run.ts`; the type-only import does not create a runtime cycle, and `run.ts` imports this module only via dynamic `import()` in Task 4.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/research/liveWorker.ts src/lib/research/liveOrchestrator.ts
git commit -m "feat(orchestration): live wiring — OpenAI llm + research pool as spawn fn"
```

---

## Task 4: Wire the agent into `runResearch` behind the mode gate

**Files:**
- Modify: `src/lib/research/run.ts`
- Test: `src/lib/research/__tests__/run.orchestration.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/research/__tests__/run.orchestration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { finalizeRun, prunePlanToInvestigated } from "../run";
import { planResearch } from "../planner";
import type { ScopePack } from "../types";

// The agentic orchestrator may investigate only a subset of the planned candidates.
// Whatever it skips becomes the pruned plan handed to finalizeRun, where the recall
// floor re-derives the registry-expected set and flags the gap as needs_review. This
// is the safety contract: the model proposes, the deterministic floor disposes.
function scope(): ScopePack {
  return {
    run_id: "orch-prune",
    facility: { address: "x", jurisdiction_stack: ["SCAQMD"], naics: null, sic: null },
    project_change: {
      description: "coating booth + flammable solvent",
      equipment: [{ kind: "coating_booth", description: "" }],
      chemicals: [{ name: "solvent", quantity: 60, unit: "gal" }],
      waste_streams: [],
      disturbance_acres: null,
      process_discharge: false,
    },
    missing_facts: [],
    assumptions: [],
  };
}

describe("prunePlanToInvestigated", () => {
  it("keeps research_graph and research_tasks in sync with the investigated ids", () => {
    const plan = planResearch(scope());
    const ids = [plan.research_graph[0].id];
    const pruned = prunePlanToInvestigated(plan, ids);
    expect(pruned.research_graph.map((h) => h.id)).toEqual(ids);
    expect(pruned.research_tasks.every((t) => ids.includes(t.hypothesis_id))).toBe(true);
  });
});

describe("recall floor backstops orchestrator pruning", () => {
  it("flags an expected program the orchestrator pruned as needs_review", async () => {
    const plan = planResearch(scope());
    // Model chose to investigate everything EXCEPT the hazmat HMBP candidate.
    const investigated = plan.research_graph.map((h) => h.id).filter((id) => id !== "H-HAZMAT-HMBP");
    const pruned = prunePlanToInvestigated(plan, investigated);
    expect(pruned.research_graph.some((h) => h.id === "H-HAZMAT-HMBP")).toBe(false);

    const run = await finalizeRun("orch-prune", scope(), pruned, [], []);

    const hmbp = run.determinations.find(
      (d) => d.requirement === "California Hazardous Materials Business Plan (HMBP)",
    );
    expect(hmbp?.applies).toBe("needs_review");
    expect(hmbp?.review_flag).toBe(true);
    expect(run.status).toBe("needs_review");
    expect(run.trace_events.some((e) => e.phase === "recall_floor" && e.artifact_id === "ca-hmbp")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/research/__tests__/run.orchestration.test.ts`
Expected: FAIL — `prunePlanToInvestigated` is not exported from `../run`.

- [ ] **Step 3: Add the pure helper to `run.ts`**

In `src/lib/research/run.ts`, add this exported function (place it just above `export async function runResearch`):

```ts
// Narrow a planned run to only the hypotheses the orchestrator actually investigated.
// research_graph and research_tasks are kept in lockstep so the recall floor (which reads
// the proposed research_graph) correctly flags anything investigated-set-minus-expected.
export function prunePlanToInvestigated(
  plan: PlannedRun["plan"],
  investigatedIds: string[],
): PlannedRun["plan"] {
  const investigated = new Set(investigatedIds);
  return {
    ...plan,
    research_graph: plan.research_graph.filter((h) => investigated.has(h.id)),
    research_tasks: plan.research_tasks.filter((t) => investigated.has(t.hypothesis_id)),
  };
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `npx vitest run src/lib/research/__tests__/run.orchestration.test.ts`
Expected: PASS (2 tests). This proves the safety contract independent of any model call.

- [ ] **Step 5: Route `runResearch` through the agent (live/modal only)**

In `src/lib/research/run.ts`, inside `runResearch`, replace the existing fan-out block — the lines from:

```ts
  const fanoutTrace = [...planned.trace_events,
    trace(run_id, "research_pool", "fanout", "running", `Launching ${planned.plan.research_tasks.length} local async workers`)];
  const poolResult = await runLocalResearchPool(planned.plan.research_tasks, planned.plan.research_graph);
  if (poolResult.degraded) {
    fanoutTrace.push(
      trace(run_id, "research_pool", "fanout", "needs_review",
        `⚠ Modal unreachable — using cached fixtures (${poolResult.degraded.reason})`)
    );
  } else {
    fanoutTrace.push(trace(run_id, "research_pool", "fanout", "done", "Research worker pool returned evidence bundles"));
  }
  const result = await finalizeRun(run_id, planned.scope_pack, planned.plan, poolResult.bundles, fanoutTrace, planned.sds_reviews);
```

with:

```ts
  const fanoutTrace = [...planned.trace_events];
  let bundles: EvidenceBundle[];
  let effectivePlan = planned.plan;
  let degraded: { reason: string } | undefined;

  if (getResearchMode() !== "fixture") {
    fanoutTrace.push(
      trace(run_id, "orchestrator", "fanout", "running",
        `Agentic orchestrator selecting from ${planned.plan.research_graph.length} candidate hypotheses`),
    );
    const { runOrchestrationAgentLive } = await import("./liveOrchestrator");
    const orchestrated = await runOrchestrationAgentLive(planned);
    if (orchestrated) {
      bundles = orchestrated.evidence_bundles;
      effectivePlan = prunePlanToInvestigated(planned.plan, orchestrated.investigated_hypothesis_ids);
      fanoutTrace.push(
        trace(run_id, "orchestrator", "fanout", "done",
          `Orchestrator investigated ${effectivePlan.research_graph.length}/${planned.plan.research_graph.length} candidates`),
      );
    } else {
      const poolResult = await runLocalResearchPool(planned.plan.research_tasks, planned.plan.research_graph);
      bundles = poolResult.bundles;
      degraded = poolResult.degraded;
      fanoutTrace.push(
        trace(run_id, "research_pool", "fanout", "needs_review",
          "Agentic orchestrator unavailable — deterministic fan-out over all candidates"),
      );
    }
  } else {
    const poolResult = await runLocalResearchPool(planned.plan.research_tasks, planned.plan.research_graph);
    bundles = poolResult.bundles;
    degraded = poolResult.degraded;
    fanoutTrace.push(trace(run_id, "research_pool", "fanout", "done", "Fixture pool returned evidence bundles"));
  }

  if (degraded) {
    fanoutTrace.push(
      trace(run_id, "research_pool", "fanout", "needs_review",
        `⚠ Executor unreachable — using cached fixtures (${degraded.reason})`),
    );
  }

  const result = await finalizeRun(run_id, planned.scope_pack, effectivePlan, bundles, fanoutTrace, planned.sds_reviews);
```

Note: `EvidenceBundle` and `getResearchMode` are already imported at the top of `run.ts` (lines 1 and 13). Do not add duplicate imports. The existing `runOrchestrationBriefing` call earlier in `runResearch` stays as-is (additive; a follow-up may fold it into the agent).

- [ ] **Step 6: Run the full research suite to confirm no regressions**

Run: `npx vitest run src/lib/research`
Expected: PASS — including the pre-existing `run.split.test.ts` (fixture mode → deterministic branch, `determinations.length === research_graph.length`) and `run.recallFloor.test.ts` (unchanged `finalizeRun` behavior).

- [ ] **Step 7: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/research/run.ts src/lib/research/__tests__/run.orchestration.test.ts
git commit -m "feat(orchestration): route live runs through agent with deterministic fallback"
```

---

## Final verification (whole-suite + manual live smoke)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3 (optional, costs tokens): manual live smoke**

With `OPENAI_API_KEY` set, trigger a `runResearch` (via the app's research entrypoint or a scratch script) on the coating-booth scope and confirm in the trace events that:
- an `orchestrator`/`fanout` event reports "investigated N/M candidates", and
- if the model skips a registry-expected program, a `recall_floor` / `needs_review` row appears for it.

If the model errors or the key is absent, confirm the run still completes via the deterministic fallback (a `research_pool`/`fanout` `needs_review` "Agentic orchestrator unavailable" event).

---

## Self-review notes (already applied)

- **Spec coverage:** model-driven investigation selection (Task 2), inter-agent comms via `spawn_researchers` (Task 2/3), real tool/prompt wiring (Task 1/3), safety backstop preserved + tested (Task 4). Fixture determinism preserved (Task 4 else-branch + `run.split` stays green).
- **Type consistency:** `SpawnFn`, `OrchestrationAgentResult`, `runOrchestrationAgent`, `ORCHESTRATION_TOOL_SCHEMAS`, `prunePlanToInvestigated`, `runOrchestrationAgentLive`, `makeLlmFn` names are identical across tasks. Reused types (`LlmFn`, `AgentMessage`, `ToolSchema`, `EvidenceBundle`, `ResearchHypothesis`, `PlannedRun`) come from existing exports.
- **No placeholders:** every code step is complete and runnable.

## Follow-ups (NOT in this plan)
1. Fold the now-redundant `runOrchestrationBriefing` into the agent (or drop it).
2. Let the orchestrator *add* hypotheses beyond the planner's candidates (discovery) — requires `propose_map_entry`/staging and a registry path.
3. Per-subagent trace/cost attribution in the UI (the reference agent could not do this; we can, since we own `spawnFn`).
4. Reactive batching: spawn a follow-up researcher when an earlier bundle returns `needs_review` with a specific gap.
