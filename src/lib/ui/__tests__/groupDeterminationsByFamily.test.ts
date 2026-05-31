import { describe, it, expect } from "vitest";
import type {
  ResearchRun,
  ResearchHypothesis,
  Determination,
  EvidenceBundle,
  VerificationVerdict,
  CoverageFamilyStatus,
  RepairTicket,
} from "@/lib/research/types";
import { groupDeterminationsByFamily } from "../selectors";

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

describe("groupDeterminationsByFamily", () => {
  it("groups determinations by coverage family from research_graph", () => {
    const hypotheses: ResearchHypothesis[] = [
      { id: "H-AIR-201", angle_id: "a1", family: "air", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
      { id: "H-AIR-219", angle_id: "a1", family: "air", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
      { id: "H-HAZMAT-HMBP", angle_id: "a2", family: "hazmat", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
    ];
    const determinations: Determination[] = [
      { requirement: "SCAQMD 201", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.9, verified: true, review_flag: false },
      { requirement: "Rule 219", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.9, verified: true, review_flag: false },
      { requirement: "HMBP", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.9, verified: true, review_flag: false },
    ];
    const bundles: EvidenceBundle[] = [
      { hypothesis_id: "H-AIR-201", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
      { hypothesis_id: "H-AIR-219", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
      { hypothesis_id: "H-HAZMAT-HMBP", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
    ];
    const verdicts: VerificationVerdict[] = [
      { hypothesis_id: "H-AIR-201", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: [] },
      { hypothesis_id: "H-AIR-219", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: [] },
      { hypothesis_id: "H-HAZMAT-HMBP", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: [] },
    ];
    const familyStatuses: CoverageFamilyStatus[] = [
      { id: "cf-air", family: "air", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
      { id: "cf-hazmat", family: "hazmat", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
    ];

    const run = makeRun({
      research_graph: hypotheses,
      determinations,
      evidence_bundles: bundles,
      verification_verdicts: verdicts,
      coverage_family_statuses: familyStatuses,
    });

    const result = groupDeterminationsByFamily(run);

    expect(result.size).toBe(2);

    const air = result.get("air")!;
    expect(air).toBeDefined();
    expect(air.family).toBe("air");
    expect(air.determinations).toHaveLength(2);
    expect(air.evidenceBundles).toHaveLength(2);
    expect(air.verdicts).toHaveLength(2);

    const hazmat = result.get("hazmat")!;
    expect(hazmat).toBeDefined();
    expect(hazmat.family).toBe("hazmat");
    expect(hazmat.determinations).toHaveLength(1);
  });

  it("returns empty map when no hypotheses exist", () => {
    const result = groupDeterminationsByFamily(makeRun());
    expect(result.size).toBe(0);
  });

  it("includes repair tickets for the correct family", () => {
    const hypotheses: ResearchHypothesis[] = [
      { id: "H-HAZMAT-HMBP", angle_id: "a1", family: "hazmat", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
    ];
    const tickets: RepairTicket[] = [
      { ticket_id: "t1", hypothesis_id: "H-HAZMAT-HMBP", failure_type: "grounding_failed", failed_check: "claim_too_broad", observed_problem: "overbroad", repair_action: "re-extract", max_attempts_remaining: 1 },
    ];
    const run = makeRun({
      research_graph: hypotheses,
      determinations: [{ requirement: "HMBP", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.9, verified: true, review_flag: false }],
      evidence_bundles: [{ hypothesis_id: "H-HAZMAT-HMBP", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] }],
      verification_verdicts: [{ hypothesis_id: "H-HAZMAT-HMBP", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: tickets }],
      repair_tickets: tickets,
      coverage_family_statuses: [{ id: "cf-hazmat", family: "hazmat", status: "active", reason: "", project_facts_considered: [], missing_facts: [] }],
    });

    const result = groupDeterminationsByFamily(run);
    const hazmat = result.get("hazmat")!;
    expect(hazmat.repairTickets).toHaveLength(1);
    expect(hazmat.repairTickets[0].ticket_id).toBe("t1");
  });

  it("sets familyStatus from coverage_family_statuses", () => {
    const hypotheses: ResearchHypothesis[] = [
      { id: "H-STORM-IGP", angle_id: "a1", family: "stormwater", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
    ];
    const familyStatuses: CoverageFamilyStatus[] = [
      { id: "cf-storm", family: "stormwater", status: "blocked_missing_fact", reason: "missing acres", project_facts_considered: [], missing_facts: ["acres"] },
    ];
    const run = makeRun({
      research_graph: hypotheses,
      determinations: [{ requirement: "IGP", applies: "needs_review", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.5, verified: false, review_flag: true }],
      evidence_bundles: [],
      verification_verdicts: [],
      coverage_family_statuses: familyStatuses,
    });

    const result = groupDeterminationsByFamily(run);
    const storm = result.get("stormwater")!;
    expect(storm.familyStatus.status).toBe("blocked_missing_fact");
  });
});
