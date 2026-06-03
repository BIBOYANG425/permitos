import type { ResearchRun, ScopePack } from "./types";
import { projectFacts } from "./scope";

// DI seam: tests inject a fake fetch (vi.mock of global fetch is unreliable under this
// vitest config). Mirrors __setFetchForTests in modal/researchPool.ts.
export type FetchFn = typeof fetch;
let fetchImpl: FetchFn | null = null;
export function __setFetchForTests(fn: FetchFn | null): void {
  fetchImpl = fn;
}
function getFetch(): FetchFn {
  return fetchImpl ?? fetch;
}

// Matched to the orchestrate Modal function's own 600s timeout: a full agentic run can
// take minutes (plan -> supervisor -> Modal fan-out -> finalize).
const REQUEST_TIMEOUT_MS = 600_000;

// Fail-loud config guard, shared so the route can assert BEFORE doing any external work
// (e.g. the OpenAI intake call in buildScope) when the research backend is unconfigured.
export function assertConfigured(): { endpoint: string; token: string } {
  const endpoint = process.env.MODAL_ORCHESTRATE_ENDPOINT;
  const token = process.env.MODAL_RESEARCH_TOKEN;
  if (!endpoint || !token) {
    throw new Error(
      "Research unavailable: MODAL_ORCHESTRATE_ENDPOINT / MODAL_RESEARCH_TOKEN not configured",
    );
  }
  return { endpoint, token };
}

// Required fields the endpoint MUST return (research_core.finalize_run's output). The two
// TS-only fields (project_facts, jurisdiction_stack) are added client-side below and
// sds_reviews is optional, so they are not checked here. Fail-loud on a malformed payload
// rather than handing the UI a broken ResearchRun.
const REQUIRED_ARRAY_FIELDS = [
  "determinations",
  "research_graph",
  "evidence_bundles",
  "verification_verdicts",
  "trace_events",
] as const;

function validateResearchRun(data: Partial<ResearchRun>): void {
  const bad = (field: string): never => {
    throw new Error(`Research unavailable: malformed orchestrate response - missing ${field}`);
  };
  if (typeof data.run_id !== "string") bad("run_id");
  if (typeof data.status !== "string") bad("status");
  if (typeof data.report_markdown !== "string") bad("report_markdown");
  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray((data as Record<string, unknown>)[field])) bad(field);
  }
}

// The single research path: POST {token, scope} to the deployed orchestrate endpoint and
// return the full ResearchRun. FAIL-LOUD — an unconfigured/unreachable endpoint, a
// non-2xx response, an error body, or a malformed payload throws a clear "research
// unavailable" error (no silent fixture fallback). finalize_run produces every ResearchRun
// field except the two TS-only ones (project_facts, jurisdiction_stack), derived here.
export async function runResearch(scope: ScopePack): Promise<ResearchRun> {
  const { endpoint, token } = assertConfigured();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await getFetch()(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, scope }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`Research unavailable: orchestrate endpoint HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as Partial<ResearchRun> & { error?: string };
    if (data.error) {
      throw new Error(`Research unavailable: orchestrate endpoint error: ${data.error}`);
    }
    validateResearchRun(data);
    return {
      ...(data as ResearchRun),
      project_facts: projectFacts(scope),
      jurisdiction_stack: scope.facility.jurisdiction_stack,
    };
  } finally {
    clearTimeout(timer);
  }
}
