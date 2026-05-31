import { describe, it, expect, vi } from "vitest";
import { enqueueRun, getDurableRun, type DurableDeps } from "../durableRun";

function deps(overrides: Partial<DurableDeps> = {}): DurableDeps {
  const runs: Record<string, any> = {};
  const evidence: Record<string, any[]> = {};
  return {
    planRun: async (_input: unknown) => ({ run_id: "run_x", scope_pack: { facility: { jurisdiction_stack: ["SCAQMD"] } } as any, plan: { research_tasks: [{ task_id: "T1", hypothesis_id: "H-AIR-201", allowed_tools: [], blocked_tools: [], budget: {} }], research_graph: [{ id: "H-AIR-201", question: "q" }], coverage_family_statuses: [], regulatory_angles: [] } as any, trace_events: [] }),
    finalizeRun: (run_id: string) => ({ run_id, status: "done", determinations: [{ verified: true }], report_markdown: "md", trace_events: [] } as any),
    startModalRun: vi.fn(async () => {}),
    store: {
      createRun: async (r: { run_id: string; [k: string]: unknown }) => { runs[r.run_id] = { ...r }; },
      getRun: async (id: string) => runs[id] ?? null,
      listEvidence: async (id: string) => evidence[id] ?? [],
      updateStatus: async (id: string, s: string) => { runs[id].status = s; },
      finalizeRun: async (id: string, res: Record<string, unknown>) => { Object.assign(runs[id], { status: "done", ...res }); },
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
