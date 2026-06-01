import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ResearchRun } from "@/lib/research/types";
import type { SdsReview } from "@/lib/sds/types";
import { useStore } from "@/lib/ui/store";
import { SdsReviewPanel } from "../SdsReviewPanel";

function makeRun(overrides: Partial<ResearchRun> = {}): ResearchRun {
  return {
    run_id: "run_sds",
    status: "needs_review",
    project_facts: {},
    jurisdiction_stack: [],
    scope_pack: {} as never,
    sds_reviews: [],
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

function makeReview(overrides: Partial<SdsReview> = {}): SdsReview {
  return {
    document: {
      id: "sds1",
      run_id: "run_sds",
      name: "acme-solvent-sds.pdf",
      source_type: "pdf",
      retention: "ephemeral",
      extracted_text: "Section 1",
      text_extraction_status: "ok",
    },
    section_map: { document_id: "sds1", sections: [] },
    overall_status: "needs_expert_review",
    quality_findings: [
      {
        id: "q1",
        severity: "critical",
        category: "section_completeness",
        title: "Missing SDS sections",
        reason: "Missing sections: 8 and 15.",
      },
      {
        id: "q2",
        severity: "warning",
        category: "freshness",
        title: "Stale revision date",
        reason: "Revision date appears older than five years.",
        source_section: 1,
      },
      {
        id: "q3",
        severity: "warning",
        category: "consistency",
        title: "Unreadable text detected",
        reason: "Several extraction fragments could not be parsed.",
      },
    ],
    safety_findings: [
      {
        id: "s1",
        severity: "warning",
        category: "handling_storage",
        title: "Storage incompatibility noted",
        reason: "Keep away from oxidizers.",
        source_section: 7,
        quote: "Keep away from oxidizers",
      },
      {
        id: "s2",
        severity: "critical",
        category: "fire_spill_disposal",
        title: "Fire and spill controls need review",
        reason: "Flammable vapors and storm drain controls are listed.",
        source_section: 6,
      },
      {
        id: "s3",
        severity: "warning",
        category: "california_ehs_implication",
        title: "California EHS implications",
        reason: "VOC and hazardous material terms may affect local review.",
        source_section: 9,
      },
    ],
    permit_handoff_facts: [
      {
        field: "flammable_liquid_storage_review",
        value: true,
        source_section: 7,
        quote: "flammable liquid storage cabinet",
        confidence: 0.78,
        review_flag: true,
        reason: "Storage review may be needed.",
      },
    ],
    ...overrides,
  };
}

describe("SdsReviewPanel", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("renders null when there are no SDS reviews", () => {
    const emptyRender = render(<SdsReviewPanel />);
    expect(emptyRender.container.firstChild).toBeNull();

    emptyRender.unmount();
    useStore.setState({ run: makeRun({ sds_reviews: [] }) });

    const emptyRunRender = render(<SdsReviewPanel />);
    expect(emptyRunRender.container.firstChild).toBeNull();
  });

  it("renders SDS quality, safety, permit handoff facts, document name, and retention", () => {
    useStore.setState({
      run: makeRun({
        sds_reviews: [makeReview()],
      }),
    });

    render(<SdsReviewPanel />);

    expect(screen.getByText("SDS review")).toBeInTheDocument();
    expect(screen.getByText("acme-solvent-sds.pdf")).toBeInTheDocument();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("ephemeral")).toBeInTheDocument();
    expect(screen.getByText("needs expert review")).toBeInTheDocument();
    expect(screen.getByText("Missing SDS sections")).toBeInTheDocument();
    expect(screen.getByText("Stale revision date")).toBeInTheDocument();
    expect(screen.getByText("Unreadable text detected")).toBeInTheDocument();
    expect(screen.getByText("Storage incompatibility noted")).toBeInTheDocument();
    expect(screen.getByText("Fire and spill controls need review")).toBeInTheDocument();
    expect(screen.getByText("California EHS implications")).toBeInTheDocument();
    expect(screen.getByText("flammable_liquid_storage_review")).toBeInTheDocument();
    expect(screen.getAllByText("section 7").length).toBeGreaterThan(0);
    expect(screen.getByText("true")).toBeInTheDocument();
    expect(screen.getByText(/flammable liquid storage cabinet/)).toBeInTheDocument();
    expect(screen.getByText("78% confidence")).toBeInTheDocument();
    expect(screen.getByText("review flagged")).toBeInTheDocument();
    expect(screen.getByText(/review-only candidate facts/i)).toBeInTheDocument();
    expect(screen.getByText(/not final determinations/i)).toBeInTheDocument();
  });

  it("bounds large or multiple SDS reviews in a scrollable body", () => {
    const manyFindings = Array.from({ length: 12 }, (_, index) => ({
      id: `q${index}`,
      severity: "warning" as const,
      category: "section_completeness" as const,
      title: `Missing section ${index}`,
      reason: "Large finding list should stay within the SDS review scroll region.",
    }));

    useStore.setState({
      run: makeRun({
        sds_reviews: [
          makeReview({ quality_findings: manyFindings }),
          makeReview({
            document: {
              ...makeReview().document,
              id: "sds2",
              name: "very-long-document-name-with-unbroken-identifier-1234567890.pdf",
            },
            quality_findings: manyFindings,
          }),
        ],
      }),
    });

    render(<SdsReviewPanel />);

    const body = screen.getByRole("region", { name: "SDS review artifacts" });
    expect(body).toHaveAttribute("tabindex", "0");
    expect(body).toHaveClass("max-h-80");
    expect(body).toHaveClass("overflow-y-auto");
    expect(body).toHaveClass("focus:ring-1");
    expect(body).toHaveClass("focus:ring-cyan-500/50");
    expect(body).toHaveAttribute("data-testid", "sds-review-scroll");
    expect(body).toHaveClass("pr-1");
    expect(screen.getByText("very-long-document-name-with-unbroken-identifier-1234567890.pdf")).toBeInTheDocument();
  });
});
