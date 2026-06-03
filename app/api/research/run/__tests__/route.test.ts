import { afterEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "../route";
import { __setFetchForTests } from "@/lib/research/orchestrateClient";

afterEach(() => {
  __setFetchForTests(null);
  delete process.env.MODAL_ORCHESTRATE_ENDPOINT;
  delete process.env.MODAL_RESEARCH_TOKEN;
  delete process.env.OPENAI_API_KEY;
});

// The handler only calls request.json(); a minimal stub avoids any NextRequest runtime
// concerns under vitest+jsdom while staying type-correct.
function req(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("POST /api/research/run", () => {
  it("builds a scope, calls the endpoint, and returns the run", async () => {
    delete process.env.OPENAI_API_KEY; // deterministic emptyScope inside buildScope
    process.env.MODAL_ORCHESTRATE_ENDPOINT = "https://endpoint.test";
    process.env.MODAL_RESEARCH_TOKEN = "t";
    __setFetchForTests(
      (async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            run_id: "run_x",
            status: "done",
            scope_pack: {},
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
            report_markdown: "# r",
          }),
        }) as unknown as Response) as typeof fetch,
    );

    const res = await POST(req({ project_description: "coating booth", demo_documents: [] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report_markdown).toBe("# r");
    expect(json.jurisdiction_stack.length).toBeGreaterThan(0);
    expect(Array.isArray(json.sds_reviews)).toBe(true);
  });

  it("returns a 500 fail-loud error when the endpoint is not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    // no MODAL_ORCHESTRATE_ENDPOINT -> orchestrateClient throws
    const res = await POST(req({ project_description: "x", demo_documents: [] }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.status).toBe("failed");
    expect(String(json.error)).toMatch(/not configured/);
  });
});
