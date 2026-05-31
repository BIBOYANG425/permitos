import type { EvidenceBundle, ResearchHypothesis, ResearchTask } from "../types";

export type ResearchPoolResult = {
  bundles: EvidenceBundle[];
  degraded?: { reason: string };
};

// DI seam: tests inject a fake fetch (vi.mock of global fetch is unreliable under
// this vitest config). Mirrors __setSpawnForTests from the old CLI bridge.
export type FetchFn = typeof fetch;
let fetchImpl: FetchFn | null = null;
export function __setFetchForTests(fn: FetchFn | null): void {
  fetchImpl = fn;
}
function getFetch(): FetchFn {
  return fetchImpl ?? fetch;
}

// All-reasoning worker: a single task can run several reasoning-model calls, so allow
// up to 300s — matched to the Modal function's own 300s timeout.
const REQUEST_TIMEOUT_MS = 300_000;

type TaskOutcome = { bundle: EvidenceBundle; transportError: boolean };

export async function runModalResearchPool(
  tasks: ResearchTask[],
  hypotheses: ResearchHypothesis[]
): Promise<ResearchPoolResult> {
  const endpoint = process.env.MODAL_RESEARCH_ENDPOINT;
  const token = process.env.MODAL_RESEARCH_TOKEN;
  if (!endpoint || !token) {
    return { bundles: [], degraded: { reason: "Modal endpoint not configured" } };
  }

  const byId = new Map(hypotheses.map((h) => [h.id, h]));
  const outcomes = await Promise.all(
    tasks.map((task) => runSingleTask(endpoint, token, task, byId.get(task.hypothesis_id)))
  );

  // Global degraded only when EVERY task failed at transport level (endpoint down).
  if (outcomes.length > 0 && outcomes.every((o) => o.transportError)) {
    return { bundles: [], degraded: { reason: "Modal endpoint unreachable" } };
  }
  return { bundles: outcomes.map((o) => o.bundle) };
}

async function runSingleTask(
  endpoint: string,
  token: string,
  task: ResearchTask,
  hypothesis: ResearchHypothesis | undefined
): Promise<TaskOutcome> {
  if (!hypothesis) {
    return { bundle: failedBundle(task.hypothesis_id, `Missing hypothesis for ${task.task_id}`), transportError: false };
  }
  const task_spec = {
    task_id: task.task_id,
    hypothesis_id: hypothesis.id,
    question: hypothesis.question,
    allowed_tools: task.allowed_tools,
    blocked_tools: task.blocked_tools,
    budget: task.budget,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await getFetch()(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, task_spec }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      // 401/5xx = endpoint-level failure -> transport error (may trigger global degraded).
      return { bundle: failedBundle(hypothesis.id, `Modal endpoint HTTP ${resp.status}`), transportError: true };
    }
    const parsed = (await resp.json()) as EvidenceBundle & { error?: string };
    if (parsed.error) {
      return { bundle: failedBundle(hypothesis.id, `Modal endpoint error: ${parsed.error}`), transportError: true };
    }
    if (!parsed.hypothesis_id) parsed.hypothesis_id = hypothesis.id;
    return { bundle: parsed, transportError: false };
  } catch (err) {
    return {
      bundle: failedBundle(hypothesis.id, err instanceof Error ? err.message : "Modal request failed"),
      transportError: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

function failedBundle(hypothesis_id: string, reason: string): EvidenceBundle {
  return {
    hypothesis_id,
    sources: [],
    extracted_claims: [],
    researcher_conclusion: "needs_review",
    uncertainties: [reason],
  };
}
