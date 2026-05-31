import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResearchHypothesis, ResearchTask } from "../../types";
import { __setFetchForTests, runModalResearchPool } from "../researchPool";

const task = (hid: string): ResearchTask => ({
  task_id: `T-${hid}`,
  hypothesis_id: hid,
  assigned_agent: "modal-worker",
  allowed_tools: ["fetch_source", "extract_threshold"],
  blocked_tools: ["get_form"],
  budget: { max_sources: 3, max_runtime_seconds: 30, max_model_calls: 4 },
});
const hyp = (hid: string): ResearchHypothesis => ({
  id: hid, angle_id: "A", family: "air", question: "?",
  required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [],
});

function okResponse(hid: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      hypothesis_id: hid,
      sources: [{ url: "u", source_name: "s", authority_rank: 1, fetched_at: "t", content_hash: "h", effective_date: null, quote: "q" }],
      extracted_claims: [{ field: "f", value: "v", source_url: "u", quote: "q", confidence: 0.9 }],
      researcher_conclusion: "applies",
      uncertainties: [],
    }),
  } as unknown as Response;
}

describe("runModalResearchPool (http)", () => {
  afterEach(() => {
    __setFetchForTests(null);
    delete process.env.MODAL_RESEARCH_ENDPOINT;
    delete process.env.MODAL_RESEARCH_TOKEN;
  });

  it("posts one request per task and returns parsed bundles", async () => {
    process.env.MODAL_RESEARCH_ENDPOINT = "https://x.modal.run/research";
    process.env.MODAL_RESEARCH_TOKEN = "secret";
    const fake = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return okResponse(body.task_spec.hypothesis_id);
    });
    __setFetchForTests(fake as unknown as typeof fetch);

    const res = await runModalResearchPool([task("H-AIR-201"), task("H-AIR-219")], [hyp("H-AIR-201"), hyp("H-AIR-219")]);

    expect(fake).toHaveBeenCalledTimes(2);
    expect(res.degraded).toBeUndefined();
    expect(res.bundles.map((b) => b.hypothesis_id).sort()).toEqual(["H-AIR-201", "H-AIR-219"]);
    const sentSpec = JSON.parse(String((fake.mock.calls[0][1] as RequestInit).body)).task_spec;
    expect(sentSpec.allowed_tools).toContain("extract_threshold");
    expect(sentSpec.blocked_tools).toContain("get_form");
  });

  it("flags degraded (no requests) when env is unset", async () => {
    const fake = vi.fn();
    __setFetchForTests(fake as unknown as typeof fetch);
    const res = await runModalResearchPool([task("H-AIR-201")], [hyp("H-AIR-201")]);
    expect(fake).not.toHaveBeenCalled();
    expect(res.degraded?.reason).toMatch(/not configured/i);
    expect(res.bundles).toEqual([]);
  });

  it("returns a per-task failure bundle on HTTP 500 (not global degraded) when others succeed", async () => {
    process.env.MODAL_RESEARCH_ENDPOINT = "https://x.modal.run/research";
    process.env.MODAL_RESEARCH_TOKEN = "secret";
    let n = 0;
    __setFetchForTests((async (_u: string, init?: RequestInit) => {
      n += 1;
      const body = JSON.parse(String(init?.body));
      if (n === 1) return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      return okResponse(body.task_spec.hypothesis_id);
    }) as unknown as typeof fetch);

    const res = await runModalResearchPool([task("H-AIR-201"), task("H-AIR-219")], [hyp("H-AIR-201"), hyp("H-AIR-219")]);
    expect(res.degraded).toBeUndefined();
    const failed = res.bundles.find((b) => b.researcher_conclusion === "needs_review");
    expect(failed).toBeDefined();
    expect(res.bundles.some((b) => b.researcher_conclusion === "applies")).toBe(true);
  });

  it("flags degraded when EVERY task fails at transport level", async () => {
    process.env.MODAL_RESEARCH_ENDPOINT = "https://x.modal.run/research";
    process.env.MODAL_RESEARCH_TOKEN = "secret";
    __setFetchForTests((async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch);
    const res = await runModalResearchPool([task("H-AIR-201"), task("H-AIR-219")], [hyp("H-AIR-201"), hyp("H-AIR-219")]);
    expect(res.degraded?.reason).toMatch(/unreachable/i);
    expect(res.bundles).toEqual([]);
  });
});
