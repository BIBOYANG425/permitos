import { describe, it, expect } from "vitest";
import { verifyEvidence } from "../verifier";
import type { EvidenceBundle, ScopePack } from "../types";

const scope: ScopePack = {
  run_id: "r",
  facility: { address: "X", jurisdiction_stack: [], naics: "323111", sic: null },
  project_change: { description: "d", equipment: [], chemicals: [], waste_streams: [], disturbance_acres: null, process_discharge: null },
  missing_facts: [],
  assumptions: [],
};

function bundle(over: Partial<EvidenceBundle> = {}): EvidenceBundle {
  const quote = "A permit to construct is required for this equipment.";
  return {
    hypothesis_id: "H-AIR-201",
    sources: [{ url: "https://www.aqmd.gov/x", source_name: "SCAQMD Rule 201", authority_rank: 1, fetched_at: "2026-05-30T00:00:00Z", content_hash: "sha256:z", effective_date: null, quote }],
    extracted_claims: [{ field: "permit_trigger", value: "permit required", source_url: "https://www.aqmd.gov/x", quote, confidence: 0.9 }],
    researcher_conclusion: "applies",
    uncertainties: [],
    ...over,
  };
}

describe("verifyEvidence generic path", () => {
  it("passes a grounded, decided bundle (quote appears in the cited source)", () => {
    const v = verifyEvidence(scope, bundle());
    expect(v.verdict).toBe("pass");
    expect(v.checks.grounding.pass).toBe(true);
    expect(v.checks.predicate_math.pass).toBe(true);
  });

  it("fails + emits a repair ticket when the extracted claim quote is NOT in the source quote", () => {
    const ungrounded = bundle({
      extracted_claims: [{ field: "permit_trigger", value: "x", source_url: "https://www.aqmd.gov/x", quote: "TEXT THAT IS NOT IN THE SOURCE", confidence: 0.9 }],
    });
    const v = verifyEvidence(scope, ungrounded);
    expect(v.verdict).toBe("fail");
    expect(v.checks.grounding.pass).toBe(false);
    expect(v.repair_tickets).toHaveLength(1);
    expect(v.repair_tickets[0].failed_check).toBe("grounding");
  });

  it("needs_review when grounded but the researcher reached no decision", () => {
    const undecided = bundle({ researcher_conclusion: "needs_review" });
    const v = verifyEvidence(scope, undecided);
    expect(v.verdict).toBe("needs_review");
    expect(v.checks.grounding.pass).toBe(true);
    expect(v.checks.predicate_math.pass).toBe(false);
  });

  it("needs_review when source authority is low even if grounded + decided", () => {
    const lowAuth = bundle({
      sources: [{ url: "https://www.aqmd.gov/x", source_name: "blog", authority_rank: 3, fetched_at: "2026-05-30T00:00:00Z", content_hash: "sha256:z", effective_date: null, quote: "A permit to construct is required for this equipment." }],
    });
    const v = verifyEvidence(scope, lowAuth);
    expect(v.verdict).toBe("needs_review");
    expect(v.checks.authority.pass).toBe(false);
  });
});
