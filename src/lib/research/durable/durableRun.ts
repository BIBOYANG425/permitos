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
