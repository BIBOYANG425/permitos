import { describe, it, expect } from "vitest";
import { runOrchestrationBriefing, type OrchestrationLlmFn } from "../orchestration";
import { ORCHESTRATION_SYSTEM_PROMPT } from "../prompts";
import { planResearch } from "../planner";
import type { ScopePack } from "../types";

const scope: ScopePack = {
  run_id: "orch-test",
  facility: { address: "x", jurisdiction_stack: ["SCAQMD", "Local CUPA"], naics: null, sic: null },
  project_change: {
    description: "adds a coating booth and stores 60 gallons of flammable solvent",
    equipment: [{ kind: "coating_booth", description: "" }],
    chemicals: [{ name: "solvent", quantity: 60, unit: "gal", hazard: "flammable" }],
    waste_streams: [],
    disturbance_acres: null,
    process_discharge: false,
  },
  missing_facts: [],
  assumptions: [],
};

function input() {
  const plan = planResearch(scope);
  return {
    scope,
    coverage_family_statuses: plan.coverage_family_statuses,
    regulatory_angles: plan.regulatory_angles,
    research_graph: plan.research_graph,
  };
}

describe("runOrchestrationBriefing", () => {
  it("steers the LLM with the orchestration system prompt and a plan summary", async () => {
    let seenSystem = "";
    let seenUser = "";
    const fake: OrchestrationLlmFn = async (system, user) => {
      seenSystem = system;
      seenUser = user;
      return "Prioritizing air and hazmat; stormwater is blocked on missing SIC/NAICS.";
    };
    const brief = await runOrchestrationBriefing(input(), fake);

    expect(seenSystem).toBe(ORCHESTRATION_SYSTEM_PROMPT);
    expect(seenSystem).toMatch(/orchestration tier/i);
    expect(seenUser).toMatch(/coating_booth/); // curated plan summary reached the model
    expect(seenUser).toMatch(/H-HAZMAT-HMBP/);
    expect(brief).toMatch(/hazmat/i);
  });

  it("returns null when the model yields nothing (fail-soft)", async () => {
    const empty: OrchestrationLlmFn = async () => null;
    expect(await runOrchestrationBriefing(input(), empty)).toBeNull();
    const blank: OrchestrationLlmFn = async () => "   ";
    expect(await runOrchestrationBriefing(input(), blank)).toBeNull();
  });
});
