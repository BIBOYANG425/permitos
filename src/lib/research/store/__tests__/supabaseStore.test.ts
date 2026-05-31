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
        async maybeSingle() { const r = rows.filter((x) => (api._filters as Array<[string, unknown]>).every(([c, v]) => x[c] === v)); return { data: r[0] ?? null, error: null }; },
        then(resolve: any) { const r = rows.filter((x) => (api._filters as Array<[string, unknown]>).every(([c, v]) => x[c] === v)); resolve({ data: r, error: null }); },
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
