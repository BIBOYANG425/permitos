import type {
  CoverageFamily,
  CoverageFamilyStatus,
  RegulatoryAngle,
  ResearchHypothesis,
  ResearchTask,
  ScopePack
} from "./types";
import { blockedToolIdsForRole, researchWorkerToolIds } from "./toolCatalog";

const coverageFamilies: CoverageFamily[] = ["air", "stormwater", "hazmat", "waste", "wastewater"];

export function planResearch(scope: ScopePack) {
  const coverage_family_statuses = coverageFamilies.map((family) => coverageStatusFor(family, scope));
  const regulatory_angles = coverage_family_statuses.flatMap((status) => anglesFor(status, scope));
  const research_graph = regulatory_angles.flatMap((angle) => hypothesesFor(angle, scope));
  const research_tasks = research_graph.map(taskForHypothesis);

  return { coverage_family_statuses, regulatory_angles, research_graph, research_tasks };
}

function coverageStatusFor(family: CoverageFamily, scope: ScopePack): CoverageFamilyStatus {
  const equipmentKinds = scope.project_change.equipment.map((item) => item.kind);
  const hasChemicals = scope.project_change.chemicals.length > 0;
  const hasWaste = scope.project_change.waste_streams.length > 0;
  const disturbance = scope.project_change.disturbance_acres;

  if (family === "air") {
    const active = equipmentKinds.length > 0;
    return {
      id: "CF-AIR",
      family,
      status: active ? "active" : "out_of_scope",
      reason: active
        ? "Project adds equipment that may emit air contaminants."
        : "No equipment added that could emit air contaminants.",
      project_facts_considered: equipmentKinds,
      missing_facts: []
    };
  }

  if (family === "stormwater") {
    const missingCode = !scope.facility.sic && !scope.facility.naics && disturbance === null;
    return {
      id: "CF-STORMWATER",
      family,
      status: missingCode ? "blocked_missing_fact" : "active",
      reason: missingCode
        ? "SIC/NAICS and disturbance acreage are missing."
        : "Industrial activity codes or construction acreage require stormwater review.",
      project_facts_considered: [`sic=${scope.facility.sic}`, `naics=${scope.facility.naics}`, `acres=${disturbance}`],
      missing_facts: missingCode ? ["facility.naics_or_sic", "project_change.disturbance_acres"] : []
    };
  }

  if (family === "hazmat") {
    const missingQuantity = hasChemicals && scope.project_change.chemicals.some((chemical) => chemical.quantity === null);
    return {
      id: "CF-HAZMAT",
      family,
      status: !hasChemicals ? "out_of_scope" : missingQuantity ? "blocked_missing_fact" : "active",
      reason: hasChemicals
        ? "Project includes hazardous material storage."
        : "No hazardous materials indicated in intake.",
      project_facts_considered: scope.project_change.chemicals.map((chemical) => `${chemical.name}:${chemical.quantity ?? "missing"} ${chemical.unit ?? ""}`),
      missing_facts: missingQuantity ? ["chemicals.quantity", "chemicals.unit"] : []
    };
  }

  if (family === "waste") {
    return {
      id: "CF-WASTE",
      family,
      status: hasWaste ? "active" : "out_of_scope",
      reason: hasWaste ? "Project identifies waste streams that need generator-status review." : "No waste stream indicated.",
      project_facts_considered: scope.project_change.waste_streams.map((stream) => `${stream.description}:${stream.kg_per_month ?? "missing"} kg/month`),
      missing_facts: scope.project_change.waste_streams.some((stream) => stream.kg_per_month === null)
        ? ["waste_streams.kg_per_month"]
        : []
    };
  }

  return {
    id: "CF-WASTEWATER",
    family,
    status: scope.project_change.process_discharge === null ? "blocked_missing_fact" : scope.project_change.process_discharge ? "active" : "out_of_scope",
    reason:
      scope.project_change.process_discharge === null
        ? "Process discharge status is missing."
        : scope.project_change.process_discharge
          ? "Project may discharge process wastewater."
          : "No process wastewater discharge indicated.",
    project_facts_considered: [`process_discharge=${scope.project_change.process_discharge}`],
    missing_facts: scope.project_change.process_discharge === null ? ["project_change.process_discharge"] : []
  };
}

function anglesFor(status: CoverageFamilyStatus, scope: ScopePack): RegulatoryAngle[] {
  if (status.status === "out_of_scope") {
    return [];
  }

  if (status.family === "air") {
    return [
      {
        id: "A-AIR-EMITTING-EQUIPMENT",
        family: "air",
        label: "New or modified emitting equipment",
        reason: "Coating or process equipment may require air district authorization.",
        triggering_facts: status.project_facts_considered,
        status: status.status
      },
      {
        id: "A-AIR-EXEMPTION-OR-REGISTRATION",
        family: "air",
        label: "Air exemption or registration path",
        reason: "SCAQMD rules may route some equipment to exemption or registration instead of a permit.",
        triggering_facts: status.project_facts_considered,
        status: status.status
      }
    ];
  }

  if (status.family === "stormwater") {
    return [
      {
        id: "A-STORMWATER-INDUSTRIAL",
        family: "stormwater",
        label: "Industrial stormwater coverage",
        reason: "SIC/NAICS may trigger California Industrial General Permit coverage.",
        triggering_facts: [`sic=${scope.facility.sic}`, `naics=${scope.facility.naics}`],
        status: scope.facility.sic || scope.facility.naics ? "active" : "blocked_missing_fact"
      },
      {
        id: "A-STORMWATER-CONSTRUCTION",
        family: "stormwater",
        label: "Construction stormwater coverage",
        reason: "Construction activity disturbing one or more acres may require permit coverage.",
        triggering_facts: [`disturbance_acres=${scope.project_change.disturbance_acres}`],
        status: scope.project_change.disturbance_acres === null ? "blocked_missing_fact" : "active"
      }
    ];
  }

  if (status.family === "hazmat") {
    return [
      {
        id: "A-HAZMAT-HMBP",
        family: "hazmat",
        label: "Hazardous material business plan threshold",
        reason: "Hazardous material quantities must be compared to reporting thresholds.",
        triggering_facts: status.project_facts_considered,
        status: status.status
      }
    ];
  }

  if (status.family === "waste") {
    return [
      {
        id: "A-WASTE-GENERATOR-STATUS",
        family: "waste",
        label: "Hazardous waste generator status",
        reason: "Spent solvent or process waste may affect generator category.",
        triggering_facts: status.project_facts_considered,
        status: status.missing_facts.length ? "blocked_missing_fact" : "active"
      }
    ];
  }

  return [
    {
      id: "A-WASTEWATER-PRETREATMENT",
      family: "wastewater",
      label: "Industrial wastewater pretreatment",
      reason: "Industrial process wastewater discharges may trigger pretreatment review.",
      triggering_facts: status.project_facts_considered,
      status: status.status
    }
  ];
}

function hypothesesFor(angle: RegulatoryAngle, scope: ScopePack): ResearchHypothesis[] {
  if (angle.id === "A-AIR-EMITTING-EQUIPMENT") {
    return [
      hypothesis("H-AIR-201", angle, "Does the new equipment require an SCAQMD Permit to Construct?", "SCAQMD Permit to Construct may apply before installing emitting equipment."),
      hypothesis("H-AIR-VOC", angle, "Do solvent VOC emissions require additional review?", "Solvent use may create VOC-related review needs.")
    ];
  }

  if (angle.id === "A-AIR-EXEMPTION-OR-REGISTRATION") {
    return [
      hypothesis("H-AIR-219", angle, "Is Rule 219 exemption available?", "Rule 219 may exempt listed equipment if conditions are satisfied."),
      hypothesis("H-AIR-222", angle, "Does Rule 222 registration apply instead?", "Rule 222 registration may apply to specified equipment categories.")
    ];
  }

  if (angle.id === "A-STORMWATER-INDUSTRIAL") {
    return [hypothesis("H-STORM-IGP", angle, "Does SIC/NAICS trigger Industrial General Permit coverage?", "SIC/NAICS may trigger California Industrial General Permit coverage.")];
  }

  if (angle.id === "A-STORMWATER-CONSTRUCTION") {
    return [hypothesis("H-STORM-CGP", angle, "Does construction disturb one or more acres?", "Construction disturbance at or above one acre may require construction stormwater permit coverage.")];
  }

  if (angle.id === "A-HAZMAT-HMBP") {
    return [hypothesis("H-HAZMAT-HMBP", angle, "Does hazardous material quantity exceed HMBP thresholds?", "HMBP applies to all hazardous material storage.")];
  }

  if (angle.id === "A-WASTE-GENERATOR-STATUS") {
    return [hypothesis("H-WASTE-GENERATOR", angle, "Does waste generation change hazardous waste generator status?", "Spent solvent may affect generator status.")];
  }

  return [hypothesis("H-WASTEWATER-PRETREATMENT", angle, "Does process wastewater discharge require pretreatment review?", "Industrial process wastewater may require pretreatment review.")];
}

function hypothesis(id: string, angle: RegulatoryAngle, question: string, claim: string): ResearchHypothesis {
  return {
    id,
    angle_id: angle.id,
    family: angle.family,
    question,
    claim_to_test: claim,
    required_facts: angle.triggering_facts,
    expected_source_type: "regulation",
    success_criteria: [
      "official or high-authority source",
      "quote contains trigger, threshold, exemption, or blocker",
      "predicate evaluation is reproducible"
    ],
    dependencies: []
  };
}

function taskForHypothesis(hypothesis: ResearchHypothesis): ResearchTask {
  return {
    task_id: `T-${hypothesis.id.slice(2)}`,
    hypothesis_id: hypothesis.id,
    assigned_agent: `${hypothesis.family}_researcher`,
    allowed_tools: researchWorkerToolIds(),
    blocked_tools: blockedToolIdsForRole("researcher"),
    budget: {
      max_sources: 3,
      max_runtime_seconds: 30,
      max_model_calls: 2
    }
  };
}
