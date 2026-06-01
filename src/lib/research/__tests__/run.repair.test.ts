import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { finalizeRun } from "../run";
import { planResearch } from "../planner";
import type { EvidenceBundle, ScopePack } from "../types";

// Locks the HMBP fail -> repair -> verified demo arc through the async, mode-aware
// finalizeRun. Fixture mode: the verifier rejects the overbroad HMBP claim (demo
// content hash), the orchestrator repairs from the canned repaired source, and the
// re-verify passes via threshold math (60 gal >= 55 gal). Hermetic — no parseScope.
const scope: ScopePack = {
  run_id: "repair-test",
  facility: { address: "x", jurisdiction_stack: ["CalEPA"], naics: null, sic: null },
  project_change: {
    description: "stores 60 gallons of flammable solvent",
    equipment: [],
    chemicals: [{ name: "solvent", quantity: 60, unit: "gal", hazard: "flammable" }],
    waste_streams: [],
    disturbance_acres: null,
    process_discharge: false,
  },
  missing_facts: [],
  assumptions: [],
};

// The "bad" HMBP evidence the fixture pool emits: overbroad claim, demo content hash.
function badHmbpBundle(): EvidenceBundle {
  const quote = "Businesses must submit information for hazardous materials at or above threshold quantities.";
  return {
    hypothesis_id: "H-HAZMAT-HMBP",
    sources: [{
      url: "https://calepa.ca.gov/cupa/hazardous-materials-business-plan/",
      source_name: "California HMBP Threshold Summary",
      authority_rank: 1,
      fetched_at: "2026-05-30T00:00:00Z",
      content_hash: "sha256:demo-hmbp-bad",
      effective_date: null,
      quote,
    }],
    extracted_claims: [{ field: "overbroad_claim", value: "HMBP applies to all hazardous material storage", source_url: "https://calepa.ca.gov/cupa/hazardous-materials-business-plan/", quote, confidence: 0.82 }],
    researcher_conclusion: "applies",
    uncertainties: [],
  };
}

describe("finalizeRun repair arc (fixture mode)", () => {
  beforeEach(() => {
    process.env.RESEARCH_MODE = "fixture";
  });
  afterEach(() => {
    process.env.RESEARCH_MODE = "fixture";
  });

  it("rejects the overbroad HMBP claim, repairs, and the re-verify passes", async () => {
    const plan = planResearch(scope);
    const run = await finalizeRun("repair-test", scope, plan, [badHmbpBundle()], []);

    // A repair ticket was queued for HMBP.
    expect(run.repair_tickets.some((t) => t.hypothesis_id === "H-HAZMAT-HMBP")).toBe(true);

    // The latest HMBP verdict (post-repair) passes: 60 gal >= the repaired 55 gal threshold.
    const hmbpVerdict = run.verification_verdicts.find((v) => v.hypothesis_id === "H-HAZMAT-HMBP");
    expect(hmbpVerdict?.verdict).toBe("pass");

    // The latest HMBP evidence is the repaired source (threshold 55), not the overbroad claim.
    const hmbpEvidence = run.evidence_bundles.find((b) => b.hypothesis_id === "H-HAZMAT-HMBP");
    expect(hmbpEvidence?.extracted_claims.some((c) => c.field === "liquid_gallons_threshold")).toBe(true);
  });
});
