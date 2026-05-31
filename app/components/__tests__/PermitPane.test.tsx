import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermitPane } from "../PermitPane";
import type { FamilyReport } from "@/lib/ui/selectors";

function makeReport(overrides: Partial<FamilyReport> = {}): FamilyReport {
  return {
    family: "hazmat",
    familyStatus: { id: "cf-hazmat", family: "hazmat", status: "active", reason: "", project_facts_considered: [], missing_facts: [] },
    determinations: [],
    evidenceBundles: [],
    verdicts: [],
    repairTickets: [],
    ...overrides,
  };
}

describe("PermitPane", () => {
  it("shows 'Permit not yet identified' when no determinations have permit_filing", () => {
    const report = makeReport({
      determinations: [{
        requirement: "HMBP", applies: "needs_review", trigger: "?", project_fact: "f",
        citation: "c", quote: "q", source_url: "u", confidence: 0.5,
        verified: false, review_flag: true,
      }],
    });
    render(<PermitPane report={report} />);
    expect(screen.getByText("Permit not yet identified")).toBeDefined();
  });

  it("renders permit details when permit_filing exists", () => {
    const report = makeReport({
      determinations: [{
        requirement: "HMBP", applies: "yes", trigger: "?", project_fact: "f",
        citation: "c", quote: "q", source_url: "u", confidence: 0.9,
        verified: true, review_flag: false,
        permit_filing: {
          form_name: "Hazardous Materials Business Plan (HMBP)",
          form_url: "https://cers.calepa.ca.gov/",
          agency: "CalEPA / Local CUPA",
          portal_url: "https://cers.calepa.ca.gov/",
          instructions: "Submit through CERS portal",
        },
      }],
    });
    render(<PermitPane report={report} />);
    expect(screen.getByText("Hazardous Materials Business Plan (HMBP)")).toBeDefined();
    expect(screen.getByText("CalEPA / Local CUPA")).toBeDefined();
    expect(screen.getByText("Submit through CERS portal")).toBeDefined();
    expect(screen.getByText("Open Filing Portal")).toBeDefined();
  });

  it("renders tabs when multiple permits exist", () => {
    const report = makeReport({
      determinations: [
        {
          requirement: "SCAQMD 201", applies: "yes", trigger: "?", project_fact: "f",
          citation: "c", quote: "q", source_url: "u", confidence: 0.9,
          verified: true, review_flag: false,
          permit_filing: {
            form_name: "Permit to Construct",
            form_url: "https://aqmd.gov/ptc",
            agency: "SCAQMD",
            portal_url: "https://aqmd.gov/permits",
          },
        },
        {
          requirement: "Rule 219", applies: "yes", trigger: "?", project_fact: "f",
          citation: "c", quote: "q", source_url: "u", confidence: 0.9,
          verified: true, review_flag: false,
          permit_filing: {
            form_name: "Rule 219 Exemption",
            form_url: "https://aqmd.gov/219",
            agency: "SCAQMD",
            portal_url: "https://aqmd.gov/permits",
          },
        },
      ],
    });
    render(<PermitPane report={report} />);
    expect(screen.getByText("Permit to Construct")).toBeDefined();
    expect(screen.getByText("Rule 219 Exemption")).toBeDefined();
  });

  it("switches permit view when clicking a tab", () => {
    const report = makeReport({
      determinations: [
        {
          requirement: "SCAQMD 201", applies: "yes", trigger: "?", project_fact: "f",
          citation: "c", quote: "q", source_url: "u", confidence: 0.9,
          verified: true, review_flag: false,
          permit_filing: {
            form_name: "Permit to Construct",
            form_url: "https://aqmd.gov/ptc",
            agency: "SCAQMD",
            portal_url: "https://aqmd.gov/permits",
          },
        },
        {
          requirement: "Rule 219", applies: "yes", trigger: "?", project_fact: "f",
          citation: "c", quote: "q", source_url: "u", confidence: 0.9,
          verified: true, review_flag: false,
          permit_filing: {
            form_name: "Rule 219 Exemption",
            form_url: "https://aqmd.gov/219",
            agency: "SCAQMD Portal",
            portal_url: "https://aqmd.gov/permits",
          },
        },
      ],
    });
    render(<PermitPane report={report} />);
    fireEvent.click(screen.getByText("Rule 219 Exemption"));
    expect(screen.getByText("SCAQMD Portal")).toBeDefined();
  });

  it("renders iframe for PDF URLs", () => {
    const report = makeReport({
      determinations: [{
        requirement: "Test", applies: "yes", trigger: "?", project_fact: "f",
        citation: "c", quote: "q", source_url: "u", confidence: 0.9,
        verified: true, review_flag: false,
        permit_filing: {
          form_name: "Test Form",
          form_url: "https://example.com/form.pdf",
          agency: "Test Agency",
          portal_url: "https://example.com/portal",
        },
      }],
    });
    const { container } = render(<PermitPane report={report} />);
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeDefined();
    expect(iframe?.getAttribute("src")).toBe("https://example.com/form.pdf");
  });
});
