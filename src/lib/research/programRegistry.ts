// Single source of truth for permit programs. The verifier owns this list;
// completeness.ts re-derives the expected set from it. Family skills are
// projections of it (see registrySkillsParity.test.ts).
import type { CoverageFamily, ScopePack } from "./types";

export type ProgramRegistryEntry = {
  id: string;
  family: CoverageFamily;
  name: string;
  what_it_does: string;
  jurisdiction: string;
  authority_source_url: string;
  authority_rank: number;
  // The planner hypotheses that investigate this program.
  hypothesis_ids: string[];
  // The EHS domain skill (src/lib/research/skills/<id>/SKILL.md) a researcher reads
  // to orient before fetching the primary source. The registry is the single source
  // of truth: source pointer + skill + extraction hint all live here so any added
  // program is immediately researchable by the live agent without touching the loop.
  research_skill_id: string;
  // What the researcher must extract and ground from the fetched primary source.
  // `field` is the claim field (verifier math branches read specific fields, e.g.
  // liquid_gallons_threshold); `ask` is the natural-language extraction target.
  extraction_hint: { field: string; ask: string };
  // Deterministic: does this project's scope make this program potentially applicable?
  // Mirrors the planner's family activation; the registry is the source of truth going forward.
  triggeredBy: (scope: ScopePack) => boolean;
};

const hasEquipment = (s: ScopePack) => s.project_change.equipment.length > 0;
const hasChemicals = (s: ScopePack) => s.project_change.chemicals.length > 0;
const hasWaste = (s: ScopePack) => s.project_change.waste_streams.length > 0;
const hasCodeOrAcres = (s: ScopePack) =>
  !!s.facility.sic || !!s.facility.naics || s.project_change.disturbance_acres !== null;
const dischargePossible = (s: ScopePack) => s.project_change.process_discharge !== false;

export const PROGRAM_REGISTRY: ProgramRegistryEntry[] = [
  {
    id: "scaqmd-permit-to-construct",
    family: "air",
    name: "SCAQMD Permit to Construct (Rule 201)",
    what_it_does: "Authorizes installing/modifying equipment that may emit air contaminants.",
    jurisdiction: "SCAQMD",
    authority_source_url: "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf",
    authority_rank: 1,
    hypothesis_ids: ["H-AIR-201", "H-AIR-VOC"],
    research_skill_id: "scaqmd-air",
    extraction_hint: { field: "permit_trigger", ask: "what equipment or activity requires written authorization or a permit to construct" },
    triggeredBy: hasEquipment,
  },
  {
    id: "scaqmd-rule-219-exemption",
    family: "air",
    name: "SCAQMD Rule 219 exemption",
    what_it_does: "Exempts listed equipment from written permit requirements if conditions are met.",
    jurisdiction: "SCAQMD",
    authority_source_url: "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-219.pdf",
    authority_rank: 1,
    hypothesis_ids: ["H-AIR-219"],
    research_skill_id: "scaqmd-air",
    extraction_hint: { field: "exemption_check_required", ask: "which equipment is exempt from written permit requirements and under what conditions" },
    triggeredBy: hasEquipment,
  },
  {
    id: "scaqmd-rule-222-registration",
    family: "air",
    name: "SCAQMD Rule 222 registration",
    what_it_does: "Registration path for specified equipment categories instead of a full permit.",
    jurisdiction: "SCAQMD",
    authority_source_url: "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-222.pdf",
    authority_rank: 1,
    hypothesis_ids: ["H-AIR-222"],
    research_skill_id: "scaqmd-air",
    extraction_hint: { field: "registration_possible", ask: "which equipment may use registration instead of a full permit" },
    triggeredBy: hasEquipment,
  },
  {
    id: "ca-industrial-general-permit",
    family: "stormwater",
    name: "California Industrial General Permit (IGP)",
    what_it_does: "Stormwater coverage triggered by industrial activity SIC/NAICS codes.",
    jurisdiction: "California Water Boards",
    authority_source_url: "https://www.waterboards.ca.gov/water_issues/programs/stormwater/industrial.html",
    authority_rank: 1,
    hypothesis_ids: ["H-STORM-IGP"],
    research_skill_id: "ca-stormwater",
    extraction_hint: { field: "regulated_sic", ask: "which industrial activities or SIC categories must obtain Industrial General Permit coverage" },
    triggeredBy: hasCodeOrAcres,
  },
  {
    id: "ca-construction-general-permit",
    family: "stormwater",
    name: "California Construction General Permit (CGP)",
    what_it_does: "Stormwater coverage for construction disturbing one or more acres.",
    jurisdiction: "California Water Boards",
    authority_source_url: "https://www.waterboards.ca.gov/water_issues/programs/stormwater/construction.html",
    authority_rank: 1,
    hypothesis_ids: ["H-STORM-CGP"],
    research_skill_id: "ca-stormwater",
    extraction_hint: { field: "acreage_threshold", ask: "the number of acres of soil disturbance that triggers Construction General Permit coverage" },
    triggeredBy: hasCodeOrAcres,
  },
  {
    id: "ca-hmbp",
    family: "hazmat",
    name: "California Hazardous Materials Business Plan (HMBP)",
    what_it_does: "Reporting plan triggered by hazardous material quantities at or above thresholds.",
    jurisdiction: "CalEPA / local CUPA",
    authority_source_url: "https://calepa.ca.gov/cupa/hazardous-materials-business-plan/",
    authority_rank: 1,
    hypothesis_ids: ["H-HAZMAT-HMBP"],
    research_skill_id: "ca-hmbp",
    extraction_hint: { field: "liquid_gallons_threshold", ask: "the numeric gallon threshold at or above which a Hazardous Materials Business Plan (HMBP) is required for a hazardous liquid" },
    triggeredBy: hasChemicals,
  },
  {
    id: "epa-hazwaste-generator",
    family: "waste",
    name: "EPA Hazardous Waste Generator Category",
    what_it_does: "Generator status (VSQG/SQG/LQG) based on monthly hazardous waste quantity.",
    jurisdiction: "US EPA / CA DTSC",
    authority_source_url: "https://www.epa.gov/hwgenerators/categories-hazardous-waste-generators",
    authority_rank: 1,
    hypothesis_ids: ["H-WASTE-GENERATOR"],
    research_skill_id: "hazwaste-generator",
    extraction_hint: { field: "generator_quantity_required", ask: "what monthly hazardous waste quantity determines the generator category" },
    triggeredBy: hasWaste,
  },
  {
    id: "epa-pretreatment",
    family: "wastewater",
    name: "EPA National Pretreatment Program",
    what_it_does: "Pretreatment requirements for industrial process wastewater discharges.",
    jurisdiction: "US EPA",
    authority_source_url: "https://www.epa.gov/npdes/national-pretreatment-program",
    authority_rank: 1,
    hypothesis_ids: ["H-WASTEWATER-PRETREATMENT"],
    research_skill_id: "industrial-pretreatment",
    extraction_hint: { field: "process_discharge_required", ask: "when industrial process wastewater discharge triggers pretreatment requirements" },
    triggeredBy: dischargePossible,
  },
  {
    id: "caa-title-v",
    family: "air",
    name: "Clean Air Act Title V Operating Permit",
    what_it_does: "Federal operating permit required once a facility's potential-to-emit reaches major-source levels.",
    jurisdiction: "US EPA / SCAQMD",
    authority_source_url: "https://www.epa.gov/title-v-operating-permits",
    authority_rank: 1,
    hypothesis_ids: ["H-AIR-TITLEV"],
    research_skill_id: "caa-title-v",
    extraction_hint: { field: "major_source_threshold", ask: "the potential-to-emit thresholds (tons per year) that make a facility a major source requiring a Title V operating permit" },
    triggeredBy: hasEquipment,
  },
  {
    id: "epcra-tier-ii",
    family: "hazmat",
    name: "EPCRA Tier II / §311-312 Reporting",
    what_it_does: "Federal community right-to-know inventory reporting for hazardous chemicals stored above reporting thresholds.",
    jurisdiction: "US EPA",
    authority_source_url: "https://www.epa.gov/epcra",
    authority_rank: 1,
    hypothesis_ids: ["H-HAZMAT-EPCRA"],
    research_skill_id: "epcra-community-right-to-know",
    extraction_hint: { field: "epcra_reporting_threshold", ask: "the chemical quantity thresholds (e.g. 10,000 lb, or the lower TPQ for extremely hazardous substances) that trigger EPCRA Tier II reporting" },
    triggeredBy: hasChemicals,
  },
  {
    id: "osha-psm",
    family: "osha",
    name: "OSHA Process Safety Management (29 CFR 1910.119)",
    what_it_does: "Worker-safety standard for processes that involve a threshold quantity of a listed highly hazardous chemical.",
    jurisdiction: "US OSHA / Cal/OSHA",
    authority_source_url: "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.119",
    authority_rank: 1,
    hypothesis_ids: ["H-OSHA-PSM"],
    research_skill_id: "osha-psm",
    extraction_hint: { field: "psm_threshold_quantity", ask: "the threshold quantity of a listed highly hazardous chemical at or above which the OSHA PSM standard applies" },
    triggeredBy: hasChemicals,
  },
];

export function allPrograms(): ProgramRegistryEntry[] {
  return PROGRAM_REGISTRY;
}

export function programsForFamily(family: CoverageFamily): ProgramRegistryEntry[] {
  return PROGRAM_REGISTRY.filter((p) => p.family === family);
}

// ---------------------------------------------------------------------------
// Hypothesis -> program resolution. The live research agent (liveResearchAgent.ts)
// and the Modal worker derive everything a researcher needs from the registry, so
// adding a program here makes it immediately researchable with no loop changes.
// ---------------------------------------------------------------------------

export function programForHypothesis(hypothesisId: string): ProgramRegistryEntry | undefined {
  return PROGRAM_REGISTRY.find((p) => p.hypothesis_ids.includes(hypothesisId));
}

export type SourcePointer = { url: string; source_name: string; authority_rank: number };

export function sourcePointerForHypothesis(hypothesisId: string): SourcePointer | null {
  const program = programForHypothesis(hypothesisId);
  if (!program) return null;
  return { url: program.authority_source_url, source_name: program.name, authority_rank: program.authority_rank };
}

export function extractionHintForHypothesis(hypothesisId: string): { field: string; ask: string } | null {
  return programForHypothesis(hypothesisId)?.extraction_hint ?? null;
}

export function skillIdForHypothesis(hypothesisId: string): string | null {
  return programForHypothesis(hypothesisId)?.research_skill_id ?? null;
}

// The union of authoritative source hosts across the registry. The host allowlist
// (sourceAllowlist.ts) derives from this so a new program's .gov host is trusted
// automatically, never by editing a second list.
export function registryHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const program of PROGRAM_REGISTRY) {
    try {
      hosts.add(new URL(program.authority_source_url).hostname);
    } catch {
      // skip malformed registry URLs rather than throwing at module load
    }
  }
  return hosts;
}
