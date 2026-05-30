import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SynthesisDetail } from "../SynthesisDetail";
import type { FamilyReport } from "@/lib/ui/selectors";
import type { ResearchRun } from "@/lib/research/types";

function makeReport(overrides: Partial<FamilyReport> = {}): FamilyReport {
  return {
    family: "hazmat",
    familyStatus: { id: "cf-hazmat", family: "hazmat", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
    determinations: [
      {
        requirement: "HMBP/CERS reporting",
        applies: "yes",
        trigger: "Hazardous material exceeds threshold?",
        project_fact: "60 gallons flammable solvent",
        citation: "CalEPA HMBP Summary, fetched 2026-05-30",
        quote: "quantities equal to or greater than 55 gallons for liquids",
        source_url: "https://calepa.ca.gov/cupa/hmbp/",
        confidence: 0.9,
        verified: true,
        review_flag: false,
        permit_filing: {
          form_name: "HMBP",
          form_url: "https://cers.calepa.ca.gov/",
          agency: "CalEPA",
          portal_url: "https://cers.calepa.ca.gov/",
        },
      },
    ],
    evidenceBundles: [
      {
        hypothesis_id: "H-HAZMAT-HMBP",
        sources: [{
          url: "https://calepa.ca.gov/cupa/hmbp/",
          source_name: "CalEPA HMBP Threshold Summary",
          authority_rank: 1,
          fetched_at: "2026-05-30T00:00:00Z",
          content_hash: "sha256:demo-hmbp-repaired",
          effective_date: null,
          quote: "quantities equal to or greater than 55 gallons for liquids",
        }],
        extracted_claims: [],
        researcher_conclusion: "applies",
        uncertainties: [],
      },
    ],
    verdicts: [
      {
        hypothesis_id: "H-HAZMAT-HMBP",
        verdict: "pass",
        checks: {
          currency: { pass: true, reason: "Source dated 2026" },
          authority: { pass: true, reason: "CalEPA is authoritative" },
          grounding: { pass: true, reason: "Quote supports claim" },
          predicate_math: { pass: true, reason: "60 >= 55 gallons" },
        },
        confidence: 0.9,
        repair_tickets: [],
      },
    ],
    repairTickets: [],
    ...overrides,
  };
}

const stubRun = {
  verification_verdicts: [],
  repair_tickets: [],
  evidence_bundles: [],
} as unknown as ResearchRun;

describe("SynthesisDetail", () => {
  it("renders family label as heading", () => {
    render(<SynthesisDetail familyLabel="Hazmat" report={makeReport()} run={stubRun} />);
    expect(screen.getByText("Hazmat")).toBeDefined();
  });

  it("renders determination summary fields", () => {
    render(<SynthesisDetail familyLabel="Hazmat" report={makeReport()} run={stubRun} />);
    expect(screen.getByText(/HMBP\/CERS reporting/)).toBeDefined();
    expect(screen.getByText(/60 gallons flammable solvent/)).toBeDefined();
  });

  it("renders source evidence with quote", () => {
    render(<SynthesisDetail familyLabel="Hazmat" report={makeReport()} run={stubRun} />);
    expect(screen.getByText("CalEPA HMBP Threshold Summary")).toBeDefined();
    expect(screen.getByText(/55 gallons for liquids/)).toBeDefined();
  });

  it("renders verifier checks", () => {
    render(<SynthesisDetail familyLabel="Hazmat" report={makeReport()} run={stubRun} />);
    expect(screen.getByText(/currency/)).toBeDefined();
    expect(screen.getByText(/authority/)).toBeDefined();
    expect(screen.getByText(/grounding/)).toBeDefined();
    expect(screen.getByText(/predicate_math/)).toBeDefined();
  });

  it("renders repair history when multiple verdicts exist for a hypothesis", () => {
    const report = makeReport();
    const runWithHistory = {
      ...stubRun,
      verification_verdicts: [
        { hypothesis_id: "H-HAZMAT-HMBP", verdict: "fail" as const, checks: { grounding: { pass: false, reason: "Claim broader than quote" } }, confidence: 0.2, repair_tickets: [] },
        { hypothesis_id: "H-HAZMAT-HMBP", verdict: "pass" as const, checks: { grounding: { pass: true, reason: "ok" } }, confidence: 0.9, repair_tickets: [] },
      ],
      repair_tickets: [{
        ticket_id: "t1",
        hypothesis_id: "H-HAZMAT-HMBP",
        failure_type: "grounding_failed" as const,
        failed_check: "grounding",
        observed_problem: "Claim broader than quote",
        repair_action: "Re-extract with threshold constraint",
        max_attempts_remaining: 1,
      }],
      evidence_bundles: report.evidenceBundles,
    } as unknown as ResearchRun;

    render(<SynthesisDetail familyLabel="Hazmat" report={report} run={runWithHistory} />);
    expect(screen.getByText(/Repair history/)).toBeDefined();
  });

  it("shows verified badge count", () => {
    render(<SynthesisDetail familyLabel="Hazmat" report={makeReport()} run={stubRun} />);
    expect(screen.getByText(/1 verified/)).toBeDefined();
  });
});
