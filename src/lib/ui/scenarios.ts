import type { ResearchRunInput } from "@/lib/research/types";

export type Scenario = {
  id: "complex" | "simple" | "missing";
  label: string;
  subtitle: string;
  payload: ResearchRunInput;
};

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "complex",
    label: "Complex SoCal Manufacturing",
    subtitle: "9 families · 1 repair · HMBP reversal",
    payload: {
      project_description:
        "Adding a new sheet metal degreasing line in Los Angeles County. " +
        "Solvent: 60 gallons of trichloroethylene (TCE) on-site at all times. " +
        "Process generates 200 kg/month of spent solvent waste. " +
        "Site disturbance during install: 0.3 acres. " +
        "Discharges 1,500 gal/day rinse water to municipal sewer. " +
        "NAICS 332813.",
      demo_documents: [],
    },
  },
  {
    id: "simple",
    label: "Simple Construction (1.2 acres)",
    subtitle: "Tests construction-stormwater YES path",
    payload: {
      project_description:
        "Single-family residential site grading in Sacramento County. " +
        "Total ground disturbance: 1.2 acres of construction work. " +
        "No chemicals on-site. No process water. No emissions equipment.",
      demo_documents: [],
    },
  },
  {
    id: "missing",
    label: "Missing Facts",
    subtitle: "Tests blocked / needs_review states",
    payload: {
      project_description:
        "Light manufacturing facility in Orange County. " +
        "Adding a new production line. Most operational details are currently unknown.",
      demo_documents: [],
    },
  },
] as const;
