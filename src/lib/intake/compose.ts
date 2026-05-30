import type { IntakeFacts } from "./types";

// Builds a prose project_description from gathered facts. Uses neutral phrasing
// ("not provided", "site grading") to avoid the keywords Person A's parseScope
// routes on (unknown / missing / omit / construction / 1.2 acre), so the run
// lands on the rich "complex" SoCal scenario.
export function composeProjectDescription(facts: IntakeFacts): string {
  const parts: string[] = [];

  const location = facts.address ?? "a Southern California manufacturing facility";
  parts.push(`Project at ${location}.`);

  if (facts.jurisdiction_stack?.length) {
    parts.push(`Jurisdictions: ${facts.jurisdiction_stack.join(", ")}.`);
  }
  if (facts.naics || facts.sic) {
    parts.push(`NAICS ${facts.naics ?? "not provided"}, SIC ${facts.sic ?? "not provided"}.`);
  }
  if (facts.project_change) {
    parts.push(facts.project_change);
  }
  if (facts.equipment?.length) {
    parts.push(`Equipment added: ${facts.equipment.map((e) => e.kind).join(", ")}.`);
  }
  if (facts.chemicals?.length) {
    const chems = facts.chemicals
      .map((c) => {
        const amount = c.quantity != null ? `${c.quantity} ${c.unit ?? ""}`.trim() : "an unspecified amount of";
        return `${amount} ${c.name}`.replace(/\s+/g, " ").trim();
      })
      .join("; ");
    parts.push(`Chemicals stored: ${chems}.`);
  }
  if (facts.waste_streams?.length) {
    const waste = facts.waste_streams
      .map((w) => `${w.description}${w.kg_per_month != null ? ` (${w.kg_per_month} kg/month)` : " (monthly quantity not provided)"}`)
      .join("; ");
    parts.push(`Waste streams: ${waste}.`);
  }
  if (facts.disturbance_acres != null) {
    parts.push(`Site grading: ${facts.disturbance_acres} acres.`);
  }
  if (facts.process_discharge != null) {
    parts.push(`Process wastewater discharge: ${facts.process_discharge ? "yes" : "no"}.`);
  }
  if (facts.notes) {
    parts.push(facts.notes);
  }

  return parts.join(" ");
}
