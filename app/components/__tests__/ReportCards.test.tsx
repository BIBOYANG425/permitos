import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReportCards } from "../ReportCards";
import { useStore } from "@/lib/ui/store";
import type { ResearchRun, ResearchHypothesis, Determination, CoverageFamilyStatus } from "@/lib/research/types";

function seedStore() {
  const hypotheses: ResearchHypothesis[] = [
    { id: "H-AIR-201", angle_id: "a1", family: "air", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
    { id: "H-AIR-219", angle_id: "a1", family: "air", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
    { id: "H-HAZMAT-HMBP", angle_id: "a2", family: "hazmat", question: "?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
  ];
  const determinations: Determination[] = [
    { requirement: "SCAQMD Permit", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.9, verified: true, review_flag: false },
    { requirement: "Rule 219", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.9, verified: true, review_flag: false },
    { requirement: "HMBP", applies: "yes", trigger: "?", project_fact: "f", citation: "c", quote: "q", source_url: "u", confidence: 0.8, verified: false, review_flag: true },
  ];
  const familyStatuses: CoverageFamilyStatus[] = [
    { id: "cf-air", family: "air", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
    { id: "cf-hazmat", family: "hazmat", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
    { id: "cf-storm", family: "stormwater", status: "out_of_scope", reason: "no stormwater", project_facts_considered: [], missing_facts: [] },
  ];
  useStore.setState({
    run: {
      run_id: "test", status: "done", project_facts: {}, jurisdiction_stack: [],
      scope_pack: {} as never, coverage_family_statuses: familyStatuses,
      regulatory_angles: [], research_graph: hypotheses, research_tasks: [],
      evidence_bundles: [
        { hypothesis_id: "H-AIR-201", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
        { hypothesis_id: "H-AIR-219", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
        { hypothesis_id: "H-HAZMAT-HMBP", sources: [], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
      ],
      verification_verdicts: [
        { hypothesis_id: "H-AIR-201", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: [] },
        { hypothesis_id: "H-AIR-219", verdict: "pass", checks: {}, confidence: 0.9, repair_tickets: [] },
        { hypothesis_id: "H-HAZMAT-HMBP", verdict: "needs_review", checks: {}, confidence: 0.8, repair_tickets: [] },
      ],
      repair_tickets: [], memory_updates: [], determinations, trace_events: [], report_markdown: "",
    } as ResearchRun,
    replayDone: true,
  });
}

describe("ReportCards", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("renders nothing before replay completes", () => {
    useStore.setState({ run: { research_graph: [] } as unknown as ResearchRun, replayDone: false });
    const { container } = render(<ReportCards />);
    expect(container.innerHTML).toBe("");
  });

  it("renders a card for each family with determinations", () => {
    seedStore();
    render(<ReportCards />);
    expect(screen.getByText("Air Quality")).toBeDefined();
    expect(screen.getByText("Hazmat")).toBeDefined();
  });

  it("shows out_of_scope families as dimmed with 'Not triggered'", () => {
    seedStore();
    render(<ReportCards />);
    expect(screen.getByText("Stormwater")).toBeDefined();
    expect(screen.getByText("Not triggered")).toBeDefined();
  });

  it("clicking an active card calls openReport", () => {
    seedStore();
    render(<ReportCards />);
    fireEvent.click(screen.getByText("Air Quality"));
    expect(useStore.getState().reportFamily).toBe("air");
  });

  it("clicking a dimmed card does not call openReport", () => {
    seedStore();
    render(<ReportCards />);
    fireEvent.click(screen.getByText("Stormwater"));
    expect(useStore.getState().reportFamily).toBeNull();
  });
});
