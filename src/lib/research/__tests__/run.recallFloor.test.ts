import { describe, it, expect } from "vitest";
import { finalizeRun } from "../run";
import { planResearch } from "../planner";
import type { ScopePack } from "../types";

// The recall floor wired into finalizeRun. A per-hypothesis verifier only sees the
// proposed set, so it is blind to a wholly-missed family. finalizeRun re-derives the
// EXPECTED program set from the registry x scope and surfaces any program that was
// never investigated as a needs_review determination row.
//
// Built deterministically (no LLM): the scope is constructed directly and the plan
// comes from the synchronous planResearch, so the test is independent of intake parsing.
function scopeWith(overrides: Partial<ScopePack["project_change"]> = {}): ScopePack {
  return {
    run_id: "recall-test",
    facility: { address: "x", jurisdiction_stack: ["SCAQMD"], naics: null, sic: null },
    project_change: {
      description: "coating booth + flammable solvent",
      equipment: [{ kind: "coating_booth", description: "" }],
      chemicals: [{ name: "solvent", quantity: 60, unit: "gal" }],
      waste_streams: [],
      disturbance_acres: null,
      process_discharge: false,
      ...overrides,
    },
    missing_facts: [],
    assumptions: [],
  };
}

describe("run.ts recall floor wiring", () => {
  it("surfaces an expected-but-uninvestigated program as a needs_review determination", () => {
    // equipment + chemicals -> air programs + ca-hmbp are expected for this scope.
    const scope = scopeWith();
    const plan = planResearch(scope);
    // Simulate an orchestrator that dropped the hazmat family entirely:
    // strip the HMBP hypothesis from the proposed research graph.
    const gappedPlan = {
      ...plan,
      research_graph: plan.research_graph.filter((h) => h.id !== "H-HAZMAT-HMBP"),
    };

    // Evidence is irrelevant to the recall floor; pass none.
    const run = finalizeRun("recall-test", scope, gappedPlan, [], []);

    const hmbpRow = run.determinations.find(
      (d) => d.requirement === "California Hazardous Materials Business Plan (HMBP)",
    );
    expect(hmbpRow, "recall floor should add a row for the missed ca-hmbp program").toBeDefined();
    expect(hmbpRow?.applies).toBe("needs_review");
    expect(hmbpRow?.review_flag).toBe(true);
    expect(run.status).toBe("needs_review");

    // The gap is also visible in the trace for the demo.
    expect(
      run.trace_events.some((e) => e.phase === "recall_floor" && e.artifact_id === "ca-hmbp"),
    ).toBe(true);
  });

  it("adds no recall-gap rows when the plan covers every expected program", () => {
    const scope = scopeWith();
    const plan = planResearch(scope);
    const run = finalizeRun("recall-test", scope, plan, [], []);

    // The real planner always proposes a superset of the registry's expected set,
    // so the recall floor is a no-op: one determination per investigated hypothesis.
    expect(run.determinations.length).toBe(plan.research_graph.length);
    expect(run.trace_events.some((e) => e.phase === "recall_floor")).toBe(false);
  });
});
