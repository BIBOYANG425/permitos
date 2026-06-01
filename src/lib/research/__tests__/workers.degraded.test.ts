import { afterEach, describe, expect, it } from "vitest";
import { runLocalResearchPool } from "../workers";
import { planResearch } from "../planner";
import type { ScopePack } from "../types";

function plan() {
  const scope: ScopePack = {
    run_id: "run_test",
    facility: { address: "X", jurisdiction_stack: [], naics: "323111", sic: null },
    project_change: {
      description: "test",
      equipment: [{ kind: "coating_booth", description: "booth" }],
      chemicals: [{ name: "solvent", quantity: 60, unit: "gal", hazard: "flammable" }],
      waste_streams: [],
      disturbance_acres: null,
      process_discharge: null,
    },
    missing_facts: [],
    assumptions: [],
  };
  return planResearch(scope);
}

describe("runLocalResearchPool degraded fallback", () => {
  const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;
  afterEach(() => {
    delete process.env.USE_MODAL;
    delete process.env.MODAL_RESEARCH_ENDPOINT;
    delete process.env.MODAL_RESEARCH_TOKEN;
    process.env.RESEARCH_MODE = "fixture"; // restore the suite default
    if (ORIGINAL_OPENAI_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
  });

  it("falls back to fixture bundles and reports degraded when Modal is unconfigured", async () => {
    process.env.RESEARCH_MODE = "modal"; // endpoint env intentionally unset -> researchPool reports degraded
    const p = plan();
    const result = await runLocalResearchPool(p.research_tasks, p.research_graph);
    expect(result.degraded?.reason).toMatch(/not configured/i);
    // fixture substitution: one bundle per task, not empty
    expect(result.bundles.length).toBe(p.research_tasks.length);
    expect(result.bundles.length).toBeGreaterThan(0);
  });

  it("falls back to fixture bundles and reports degraded when live mode has no API key", async () => {
    process.env.RESEARCH_MODE = "live";
    delete process.env.OPENAI_API_KEY; // live worker is honest fail-closed without a key
    const p = plan();
    const result = await runLocalResearchPool(p.research_tasks, p.research_graph);
    expect(result.degraded?.reason).toMatch(/OPENAI_API_KEY/i);
    expect(result.bundles.length).toBe(p.research_tasks.length);
  });

  it("returns fixture bundles with no degraded flag in fixture mode", async () => {
    process.env.RESEARCH_MODE = "fixture";
    const p = plan();
    const result = await runLocalResearchPool(p.research_tasks, p.research_graph);
    expect(result.degraded).toBeUndefined();
    expect(result.bundles.length).toBe(p.research_tasks.length);
  });
});
