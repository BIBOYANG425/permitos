import { describe, it, expect } from "vitest";
import type { ResearchRun, VerificationVerdict, RepairTicket, EvidenceBundle, Determination } from "@/lib/research/types";
import { getVerificationCounts, getRepairHistory, isHypothesisVisible } from "../selectors";

function makeRun(overrides: Partial<ResearchRun> = {}): ResearchRun {
  return {
    run_id: "test",
    status: "done",
    project_facts: {},
    jurisdiction_stack: [],
    scope_pack: {} as never,
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
    report_markdown: "",
    ...overrides,
  };
}

describe("getVerificationCounts", () => {
  it("counts verified, needs_review, blocked, and credits repairs", () => {
    const run = makeRun({
      determinations: [
        { requirement: "A", applies: "yes", trigger: "", project_fact: "", citation: "", quote: "", source_url: "", confidence: 0.9, verified: true, review_flag: false },
        { requirement: "B", applies: "needs_review", trigger: "", project_fact: "", citation: "", quote: "", source_url: "", confidence: 0.5, verified: false, review_flag: true },
        { requirement: "C", applies: "yes", trigger: "", project_fact: "", citation: "", quote: "", source_url: "", confidence: 0.8, verified: true, review_flag: false },
      ] as Determination[],
      verification_verdicts: [
        { hypothesis_id: "h1", verdict: "fail", checks: {}, confidence: 0.2, repair_tickets: [{ ticket_id: "t1" } as RepairTicket] },
        { hypothesis_id: "h1", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: [] },
      ] as VerificationVerdict[],
      repair_tickets: [{ ticket_id: "t1" } as RepairTicket],
      coverage_family_statuses: [
        { id: "c1", family: "stormwater", status: "blocked_missing_fact", reason: "", project_facts_considered: [], missing_facts: ["disturbance_acres"] },
      ],
    });

    const counts = getVerificationCounts(run);
    expect(counts.verified).toBe(2);
    expect(counts.needs_review).toBe(1);
    expect(counts.failed_open).toBe(0);
    expect(counts.repairs_ran).toBe(1);
    expect(counts.blocked).toBe(1);
  });
});

describe("getRepairHistory", () => {
  it("returns chronological attempts for a hypothesis with one repair", () => {
    const run = makeRun({
      verification_verdicts: [
        { hypothesis_id: "hmbp", verdict: "fail", checks: { claim_too_broad: { pass: false, reason: "Quote only addresses threshold qty" } }, confidence: 0.2, repair_tickets: [{ ticket_id: "t1", hypothesis_id: "hmbp", failure_type: "grounding_failed", failed_check: "claim_too_broad", observed_problem: "claim is overbroad", repair_action: "Re-extract with 55 gal threshold", max_attempts_remaining: 1 }] },
      ] as VerificationVerdict[],
      repair_tickets: [
        { ticket_id: "t1", hypothesis_id: "hmbp", failure_type: "grounding_failed", failed_check: "claim_too_broad", observed_problem: "claim is overbroad", repair_action: "Re-extract with 55 gal threshold", max_attempts_remaining: 1 },
      ],
      evidence_bundles: [
        { hypothesis_id: "hmbp", sources: [{ url: "u", source_name: "n", authority_rank: 1, fetched_at: "", content_hash: "", effective_date: null, quote: "Businesses storing >= 55 gal..." }], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
      ] as EvidenceBundle[],
    });

    const history = getRepairHistory(run, "hmbp");
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].verdict).toBe("fail");
    expect(history[0].failed_check).toBe("claim_too_broad");
  });

  it("returns empty array when no repair", () => {
    expect(getRepairHistory(makeRun(), "nope")).toEqual([]);
  });
});

describe("isHypothesisVisible", () => {
  it("returns true when task_graph event has been replayed", () => {
    const run = makeRun({
      trace_events: [
        { id: "e1", run_id: "r", ts: "1", actor: "orchestrator", phase: "task_graph", status: "done", message: "" },
      ],
    });
    expect(isHypothesisVisible(run, "h_any", new Set(["e1"]))).toBe(true);
  });
  it("returns false before task_graph event is replayed", () => {
    const run = makeRun({
      trace_events: [
        { id: "e1", run_id: "r", ts: "1", actor: "orchestrator", phase: "task_graph", status: "done", message: "" },
      ],
    });
    expect(isHypothesisVisible(run, "h_any", new Set())).toBe(false);
  });
});
