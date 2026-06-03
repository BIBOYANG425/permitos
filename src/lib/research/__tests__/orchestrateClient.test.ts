import { afterEach, describe, expect, it, vi } from "vitest";
import { __setFetchForTests, runResearch } from "../orchestrateClient";
import type { ResearchRun, ScopePack } from "../types";

const scope: ScopePack = {
  run_id: "run_test",
  facility: { address: "Fontana, CA", jurisdiction_stack: ["SCAQMD"], naics: null, sic: null },
  project_change: {
    description: "coating booth",
    equipment: [],
    chemicals: [],
    waste_streams: [],
    disturbance_acres: null,
    process_discharge: null,
  },
  missing_facts: [],
  assumptions: [],
};

function endpointRun(): Partial<ResearchRun> {
  return {
    run_id: "run_test",
    status: "done",
    scope_pack: scope,
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
    report_markdown: "# report",
  };
}

afterEach(() => {
  __setFetchForTests(null);
  delete process.env.MODAL_ORCHESTRATE_ENDPOINT;
  delete process.env.MODAL_RESEARCH_TOKEN;
});

describe("orchestrateClient.runResearch", () => {
  it("POSTs {token, scope} and returns the run with project_facts + jurisdiction_stack added", async () => {
    process.env.MODAL_ORCHESTRATE_ENDPOINT = "https://endpoint.test";
    process.env.MODAL_RESEARCH_TOKEN = "secret-token";
    const fake = vi.fn(
      async () =>
        ({ ok: true, status: 200, json: async () => endpointRun() }) as unknown as Response,
    );
    __setFetchForTests(fake as unknown as typeof fetch);

    const run = await runResearch(scope);

    expect(run.determinations).toEqual([]);
    expect(run.report_markdown).toBe("# report");
    expect(run.jurisdiction_stack).toEqual(["SCAQMD"]);
    expect(run.project_facts).toMatchObject({ address: "Fontana, CA" });
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://endpoint.test");
    expect(JSON.parse(String(init.body))).toEqual({ token: "secret-token", scope });
  });

  it("throws fail-loud on a non-2xx response", async () => {
    process.env.MODAL_ORCHESTRATE_ENDPOINT = "https://endpoint.test";
    process.env.MODAL_RESEARCH_TOKEN = "secret-token";
    __setFetchForTests(
      (async () => ({ ok: false, status: 502, json: async () => ({}) }) as unknown as Response) as typeof fetch,
    );
    await expect(runResearch(scope)).rejects.toThrow(/HTTP 502/);
  });

  it("throws fail-loud when the endpoint is unreachable", async () => {
    process.env.MODAL_ORCHESTRATE_ENDPOINT = "https://endpoint.test";
    process.env.MODAL_RESEARCH_TOKEN = "secret-token";
    __setFetchForTests(
      (async () => {
        throw new Error("network down");
      }) as typeof fetch,
    );
    await expect(runResearch(scope)).rejects.toThrow(/network down/);
  });

  it("throws fail-loud when env is not configured", async () => {
    await expect(runResearch(scope)).rejects.toThrow(/not configured/);
  });
});
