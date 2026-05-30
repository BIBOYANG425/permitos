import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceDrawer } from "../EvidenceDrawer";
import { useStore } from "@/lib/ui/store";
import type { ResearchRun } from "@/lib/research/types";

function makeRun(): ResearchRun {
  return {
    run_id: "r", status: "done", project_facts: {}, jurisdiction_stack: [],
    scope_pack: {} as never, coverage_family_statuses: [], regulatory_angles: [],
    research_graph: [{ id: "hmbp", angle_id: "a", family: "hazmat", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] }],
    research_tasks: [],
    evidence_bundles: [{ hypothesis_id: "hmbp", sources: [{ url: "https://example.org/x", source_name: "CA HSC", authority_rank: 1, fetched_at: "2026-01-01", content_hash: "abc123def456", effective_date: null, quote: "Businesses storing >= 55 gallons must file HMBP." }], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] }],
    verification_verdicts: [{ hypothesis_id: "hmbp", verdict: "pass", checks: { grounding: { pass: true, reason: "quote supports claim" } }, confidence: 0.9, repair_tickets: [] }],
    repair_tickets: [], memory_updates: [], determinations: [], trace_events: [], report_markdown: "",
  };
}

describe("EvidenceDrawer", () => {
  beforeEach(() => { useStore.getState().reset(); });

  it("renders nothing when closed", () => {
    useStore.setState({ run: makeRun(), selectedHypothesisId: "hmbp", drawerOpen: false });
    const { container } = render(<EvidenceDrawer />);
    expect(container.firstChild).toBeNull();
  });

  it("renders source quote when open", () => {
    useStore.setState({ run: makeRun(), selectedHypothesisId: "hmbp", drawerOpen: true });
    render(<EvidenceDrawer />);
    expect(screen.getByText(/Businesses storing/)).toBeInTheDocument();
    expect(screen.getByText("CA HSC")).toBeInTheDocument();
  });
});
