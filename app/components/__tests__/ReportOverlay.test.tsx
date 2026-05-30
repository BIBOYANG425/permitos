import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReportOverlay } from "../ReportOverlay";
import { useStore } from "@/lib/ui/store";
import type { ResearchRun } from "@/lib/research/types";

function seedStore() {
  useStore.setState({
    run: {
      run_id: "test", status: "done", project_facts: {}, jurisdiction_stack: [],
      scope_pack: {} as never, coverage_family_statuses: [
        { id: "cf-air", family: "air", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
      ],
      regulatory_angles: [],
      research_graph: [
        { id: "H-AIR-201", angle_id: "a1", family: "air", question: "Need permit?", required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [] },
      ],
      research_tasks: [],
      evidence_bundles: [
        { hypothesis_id: "H-AIR-201", sources: [{ url: "u", source_name: "SCAQMD", authority_rank: 1, fetched_at: "2026-01-01", content_hash: "abc", effective_date: null, quote: "test quote" }], extracted_claims: [], researcher_conclusion: "applies", uncertainties: [] },
      ],
      verification_verdicts: [
        { hypothesis_id: "H-AIR-201", verdict: "pass", checks: { currency: { pass: true, reason: "ok" } }, confidence: 0.9, repair_tickets: [] },
      ],
      repair_tickets: [], memory_updates: [],
      determinations: [
        { requirement: "SCAQMD 201", applies: "yes", trigger: "Need permit?", project_fact: "equipment", citation: "c", quote: "test quote", source_url: "u", confidence: 0.9, verified: true, review_flag: false },
      ],
      trace_events: [], report_markdown: "",
    } as ResearchRun,
    replayDone: true,
    reportFamily: "air",
  });
}

describe("ReportOverlay", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("renders nothing when reportFamily is null", () => {
    const { container } = render(<ReportOverlay />);
    expect(container.innerHTML).toBe("");
  });

  it("renders overlay when reportFamily is set", () => {
    seedStore();
    render(<ReportOverlay />);
    expect(screen.getByText("Air Quality")).toBeDefined();
  });

  it("close button calls closeReport", () => {
    seedStore();
    render(<ReportOverlay />);
    fireEvent.click(screen.getByLabelText("Close overlay"));
    expect(useStore.getState().reportFamily).toBeNull();
  });

  it("Escape key closes overlay", () => {
    seedStore();
    render(<ReportOverlay />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useStore.getState().reportFamily).toBeNull();
  });

  it("clicking backdrop closes overlay", () => {
    seedStore();
    render(<ReportOverlay />);
    fireEvent.click(screen.getByTestId("overlay-backdrop"));
    expect(useStore.getState().reportFamily).toBeNull();
  });
});
