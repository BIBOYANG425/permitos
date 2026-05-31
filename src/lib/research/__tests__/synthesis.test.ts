import { describe, it, expect } from "vitest";
import { synthesize } from "../synthesis";
import type { EvidenceBundle, RegulatoryAngle, ResearchHypothesis, ScopePack, VerificationVerdict } from "../types";

const scope: ScopePack = {
  run_id: "r",
  facility: { address: "X", jurisdiction_stack: [], naics: null, sic: null },
  project_change: { description: "d", equipment: [], chemicals: [], waste_streams: [], disturbance_acres: null, process_discharge: null },
  missing_facts: [],
  assumptions: [],
};
const hypothesis: ResearchHypothesis = {
  id: "H-AIR-201", angle_id: "A-AIR", family: "air", question: "Permit to construct?",
  required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [],
};
const angle: RegulatoryAngle = { id: "A-AIR", family: "air", label: "Air permit", reason: "", triggering_facts: [], status: "active" };
function ev(conclusion: EvidenceBundle["researcher_conclusion"]): EvidenceBundle {
  return {
    hypothesis_id: "H-AIR-201",
    sources: [{ url: "u", source_name: "s", authority_rank: 1, fetched_at: "2026-05-30T00:00:00Z", content_hash: "h", effective_date: null, quote: "q" }],
    extracted_claims: [{ field: "permit_trigger", value: "v", source_url: "u", quote: "q", confidence: 0.9 }],
    researcher_conclusion: conclusion,
    uncertainties: [],
  };
}
const passVerdict: VerificationVerdict = {
  hypothesis_id: "H-AIR-201", verdict: "pass",
  checks: { grounding: { pass: true, reason: "" } }, confidence: 0.9, repair_tickets: [],
};

describe("synthesize reads researcher_conclusion", () => {
  it("maps a verified does_not_apply finding to applies=no", () => {
    const { determinations } = synthesize(scope, [hypothesis], [angle], [ev("does_not_apply")], [passVerdict]);
    expect(determinations[0].applies).toBe("no");
    expect(determinations[0].verified).toBe(true);
  });
  it("maps a verified applies finding to applies=yes", () => {
    const { determinations } = synthesize(scope, [hypothesis], [angle], [ev("applies")], [passVerdict]);
    expect(determinations[0].applies).toBe("yes");
  });
});
