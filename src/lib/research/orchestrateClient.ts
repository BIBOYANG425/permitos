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

// The single research path: POST {token, scope} to the deployed orchestrate endpoint and
// return the full ResearchRun. FAIL-LOUD — an unconfigured/unreachable endpoint, a
// non-2xx response, or an error body throws a clear "research unavailable" error (no
// silent fixture fallback). finalize_run produces every ResearchRun field except the two
// TS-only ones (project_facts, jurisdiction_stack), which are derived from the scope here.
export async function runResearch(scope: ScopePack): Promise<ResearchRun> {
  const endpoint = process.env.MODAL_ORCHESTRATE_ENDPOINT;
  const token = process.env.MODAL_RESEARCH_TOKEN;
  if (!endpoint || !token) {
    throw new Error(
      "Research unavailable: MODAL_ORCHESTRATE_ENDPOINT / MODAL_RESEARCH_TOKEN not configured",
    );
  }

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
    return {
      ...(data as ResearchRun),
      project_facts: projectFacts(scope),
      jurisdiction_stack: scope.facility.jurisdiction_stack,
    };
  } finally {
    clearTimeout(timer);
  }
}
