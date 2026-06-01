import OpenAI from "openai";
import type { ResearchRunInput, ScopePack } from "./types";
import type { SdsReview } from "@/lib/sds/types";
import { SCOPE_EXTRACTION_SYSTEM } from "./prompts";

export function createRunId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const JURISDICTION_STACK = ["SCAQMD", "California Water Boards", "Local CUPA"];

const SUBMIT_SCOPE_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_scope",
    description: "Return the structured facts extracted from the project description.",
    parameters: {
      type: "object",
      properties: {
        address: { type: ["string", "null"] },
        naics: { type: ["string", "null"] },
        sic: { type: ["string", "null"] },
        equipment: {
          type: "array",
          items: {
            type: "object",
            properties: { kind: { type: "string" }, description: { type: "string" } },
            required: ["kind"],
          },
        },
        chemicals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: ["number", "null"] },
              unit: { type: ["string", "null"] },
              hazard: { type: "string" },
            },
            required: ["name"],
          },
        },
        waste_streams: {
          type: "array",
          items: {
            type: "object",
            properties: { description: { type: "string" }, kg_per_month: { type: ["number", "null"] } },
            required: ["description"],
          },
        },
        disturbance_acres: { type: ["number", "null"] },
        process_discharge: { type: ["boolean", "null"] },
      },
      required: [],
    },
  },
};

type ScopeFacts = {
  address?: string | null;
  naics?: string | null;
  sic?: string | null;
  equipment?: Array<{ kind?: unknown; description?: unknown }>;
  chemicals?: Array<{ name?: unknown; quantity?: unknown; unit?: unknown; hazard?: unknown }>;
  waste_streams?: Array<{ description?: unknown; kg_per_month?: unknown }>;
  disturbance_acres?: number | null;
  process_discharge?: boolean | null;
};

export function emptyScope(runId: string, description: string): ScopePack {
  return {
    run_id: runId,
    facility: {
      address: "Unspecified Southern California facility",
      jurisdiction_stack: JURISDICTION_STACK,
      naics: null,
      sic: null,
    },
    project_change: {
      description: description || "Unspecified project change.",
      equipment: [],
      chemicals: [],
      waste_streams: [],
      disturbance_acres: null,
      process_discharge: null,
    },
    missing_facts: [
      {
        field: "scope_extraction",
        why_needed: "Project facts could not be extracted (no LLM key or extraction failed).",
        blocks: ["air", "stormwater", "hazmat", "waste", "wastewater"],
      },
    ],
    assumptions: [],
  };
}

export function scopePackFromFacts(facts: ScopeFacts, runId: string, description: string): ScopePack {
  const equipment = (facts.equipment ?? [])
    .filter((e): e is { kind: string; description?: unknown } => !!e && typeof e.kind === "string")
    .map((e) => ({ kind: e.kind, description: typeof e.description === "string" ? e.description : "" }));

  const chemicals = (facts.chemicals ?? [])
    .filter((c): c is { name: string; quantity?: unknown; unit?: unknown; hazard?: unknown } => !!c && typeof c.name === "string")
    .map((c) => ({
      name: c.name,
      quantity: typeof c.quantity === "number" ? c.quantity : null,
      unit: typeof c.unit === "string" ? c.unit : null,
      ...(typeof c.hazard === "string" ? { hazard: c.hazard } : {}),
    }));

  const waste_streams = (facts.waste_streams ?? [])
    .filter((w): w is { description: string; kg_per_month?: unknown } => !!w && typeof w.description === "string")
    .map((w) => ({ description: w.description, kg_per_month: typeof w.kg_per_month === "number" ? w.kg_per_month : null }));

  const disturbance_acres = typeof facts.disturbance_acres === "number" ? facts.disturbance_acres : null;
  const process_discharge = typeof facts.process_discharge === "boolean" ? facts.process_discharge : null;
  const naics = typeof facts.naics === "string" ? facts.naics : null;
  const sic = typeof facts.sic === "string" ? facts.sic : null;

  const missing_facts: ScopePack["missing_facts"] = [];
  if (chemicals.some((c) => c.quantity === null)) {
    missing_facts.push({ field: "chemicals.quantity", why_needed: "HMBP threshold comparison needs the stored quantity.", blocks: ["hazmat"] });
  }
  if (waste_streams.some((w) => w.kg_per_month === null)) {
    missing_facts.push({ field: "waste_streams.kg_per_month", why_needed: "Hazardous waste generator category depends on monthly generation quantity.", blocks: ["waste"] });
  }
  if (!naics && !sic) {
    missing_facts.push({ field: "facility.naics_or_sic", why_needed: "Industrial stormwater coverage depends on SIC/NAICS.", blocks: ["stormwater"] });
  }
  if (process_discharge === null) {
    missing_facts.push({ field: "project_change.process_discharge", why_needed: "Wastewater pretreatment depends on whether process wastewater is discharged.", blocks: ["wastewater"] });
  }

  return {
    run_id: runId,
    facility: {
      address: typeof facts.address === "string" && facts.address ? facts.address : "Southern California facility",
      jurisdiction_stack: JURISDICTION_STACK,
      naics,
      sic,
    },
    project_change: { description: description || "Project change.", equipment, chemicals, waste_streams, disturbance_acres, process_discharge },
    missing_facts,
    assumptions: [{ claim: "Facility is in SCAQMD / California jurisdiction.", basis: "Southern-California-scoped demo.", confidence: 0.7 }],
  };
}

export async function parseScope(input: ResearchRunInput, runId: string): Promise<ScopePack> {
  const description = input.project_description.trim();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return emptyScope(runId, description);
  }
  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_INTAKE_MODEL ?? "gpt-4o-mini";
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SCOPE_EXTRACTION_SYSTEM },
        { role: "user", content: description },
      ],
      tools: [SUBMIT_SCOPE_TOOL],
      tool_choice: { type: "function", function: { name: "submit_scope" } },
      max_tokens: 800,
    });
    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") {
      return emptyScope(runId, description);
    }
    const facts = JSON.parse(toolCall.function.arguments || "{}") as ScopeFacts;
    return scopePackFromFacts(facts, runId, description);
  } catch (error) {
    console.error("parseScope LLM extraction failed; using empty scope:", error);
    return emptyScope(runId, description);
  }
}

export function projectFacts(scope: ScopePack): Record<string, unknown> {
  return {
    address: scope.facility.address,
    naics: scope.facility.naics,
    sic: scope.facility.sic,
    equipment: scope.project_change.equipment,
    chemicals: scope.project_change.chemicals,
    waste_streams: scope.project_change.waste_streams,
    disturbance_acres: scope.project_change.disturbance_acres,
    process_discharge: scope.project_change.process_discharge,
    missing_facts: scope.missing_facts,
  };
}

// Fold confirmed SDS handoff facts back into scope as candidate facts: when an
// SDS flags hazardous material or waste but intake listed none, add a placeholder
// with a missing-quantity flag so the family is reviewed (fail-closed, never a
// guessed determination). All confirmed facts are also recorded as assumptions.
export function applySdsHandoffToScope(scope: ScopePack, sdsReviews: SdsReview[]): ScopePack {
  const permitHandoffFacts = sdsReviews.flatMap((review) =>
    review.permit_handoff_facts.filter((fact) => fact.review_flag && fact.value === true)
  );

  if (permitHandoffFacts.length === 0) {
    return scope;
  }

  const chemicals = scope.project_change.chemicals.map((chemical) => ({ ...chemical }));
  const wasteStreams = scope.project_change.waste_streams.map((stream) => ({ ...stream }));
  const assumptions = scope.assumptions.map((assumption) => ({ ...assumption }));
  const missingFacts = scope.missing_facts.map((missingFact) => ({
    ...missingFact,
    blocks: [...missingFact.blocks]
  }));

  if (permitHandoffFacts.some(isHazardousMaterialFact) && chemicals.length === 0) {
    chemicals.push({
      name: "SDS candidate hazardous material",
      quantity: null,
      unit: null,
      hazard: "SDS candidate"
    });
    addMissingFactOnce(missingFacts, {
      field: "chemicals.quantity",
      why_needed: "SDS handoff indicates hazardous material review, but quantity and units still require confirmation.",
      blocks: ["hmbp_threshold"]
    });
  }

  if (permitHandoffFacts.some(isHazardousWasteFact) && wasteStreams.length === 0) {
    wasteStreams.push({
      description: "SDS candidate hazardous waste stream",
      kg_per_month: null
    });
    addMissingFactOnce(missingFacts, {
      field: "waste_streams.kg_per_month",
      why_needed: "SDS handoff indicates hazardous waste review, but monthly waste generation still requires confirmation.",
      blocks: ["hazardous_waste_generator_status"]
    });
  }

  for (const fact of permitHandoffFacts) {
    assumptions.push({
      claim: `SDS candidate fact: ${fact.field}=${String(fact.value)}`,
      basis: `Section ${fact.source_section}: ${fact.quote}`,
      confidence: fact.confidence
    });
  }

  return {
    ...scope,
    project_change: {
      ...scope.project_change,
      chemicals,
      waste_streams: wasteStreams
    },
    missing_facts: missingFacts,
    assumptions
  };
}

function addMissingFactOnce(
  missingFacts: ScopePack["missing_facts"],
  missingFact: ScopePack["missing_facts"][number]
) {
  if (missingFacts.some((candidate) => candidate.field === missingFact.field)) {
    return;
  }
  missingFacts.push(missingFact);
}

function isHazardousMaterialFact(fact: SdsReview["permit_handoff_facts"][number]) {
  return [
    "hazardous_material_inventory_review",
    "flammable_liquid_storage_review",
    "incompatible_storage_review",
    "california_ehs_review"
  ].includes(fact.field);
}

function isHazardousWasteFact(fact: SdsReview["permit_handoff_facts"][number]) {
  return fact.field === "hazardous_waste_review";
}
