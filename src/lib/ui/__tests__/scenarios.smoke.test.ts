import { describe, it, expect } from "vitest";
import { runResearch } from "@/lib/research/run";
import { SCENARIOS } from "../scenarios";

// Obsolete in vitest: these end-to-end smokes asserted the OLD seeded parseScope
// pipeline (deterministic HMBP repair, etc.). parseScope is now LLM-driven, which
// unit tests must not call over the network — so the deterministic logic moved to
// scope.test.ts / planner.test.ts, and full-pipeline integration moved to the
// keyed `pnpm eval`. Skipped here rather than deleted to preserve intent.
describe.skip("scenario smoke (moved to keyed `pnpm eval` — parseScope is LLM-driven)", () => {
  it("complex scenario produces an HMBP repair that ends verified", async () => {
    const complex = SCENARIOS.find((s) => s.id === "complex")!;
    const run = await runResearch(complex.payload);
    expect(run.repair_tickets.length).toBeGreaterThan(0);
    const hmbp = run.determinations.find((d) => d.requirement.toLowerCase().includes("hmbp"));
    expect(hmbp, "HMBP determination must exist").toBeDefined();
    expect(hmbp!.verified, "HMBP must end verified after repair").toBe(true);
  });

  it("simple construction scenario produces construction-stormwater determination", async () => {
    const simple = SCENARIOS.find((s) => s.id === "simple")!;
    const run = await runResearch(simple.payload);
    const sw = run.determinations.find((d) => d.requirement.toLowerCase().includes("stormwater") || d.requirement.toLowerCase().includes("construction"));
    expect(sw, "construction stormwater determination must exist").toBeDefined();
  });

  it("missing-facts scenario produces missing_facts entries", async () => {
    const m = SCENARIOS.find((s) => s.id === "missing")!;
    const run = await runResearch(m.payload);
    expect(run.scope_pack.missing_facts.length).toBeGreaterThan(0);
  });
});
