import { describe, expect, it } from "vitest";
import {
  type SkillDefinition,
  allToolIdsForSkill,
  getSkill,
  skillRegistry,
  skillsForRole,
  validateSkillRegistry,
} from "../skillRegistry";
import { researcherCoreToolIds, universalHarnessToolIds } from "../toolCatalog";

describe("skillRegistry", () => {
  it("validates clean — every skill tool is real and scoped to its role (or universal)", () => {
    expect(validateSkillRegistry()).toEqual([]);
  });

  it("covers every pipeline role with at least one skill", () => {
    const pipelineRoles = [
      "intake",
      "planner",
      "triage",
      "researcher",
      "verifier",
      "synthesizer",
      "discovery",
      "system",
    ] as const;
    for (const role of pipelineRoles) {
      expect(skillsForRole(role).length).toBeGreaterThan(0);
    }
  });

  it("research skill grants exactly the researcher core tools", () => {
    expect(getSkill("research").allowedToolIds).toEqual([...researcherCoreToolIds]);
  });

  it("intake skill owns the completeness gate", () => {
    expect(getSkill("intake").allowedToolIds).toContain("intake_completeness_gate");
  });

  it("verification skill encodes all four verification levels", () => {
    expect(getSkill("verification").allowedToolIds).toEqual(
      expect.arrayContaining([
        "verify_determination",
        "self_consistency",
        "verify_determination_set",
        "verify_process_trace",
      ]),
    );
  });

  it("freshness sweep stays within system scope and delegates re-research", () => {
    const tools = getSkill("freshness_sweep").allowedToolIds;
    expect(tools).toEqual(["freshness_sweep"]);
    expect(tools).not.toContain("fetch_source");
    expect(tools).not.toContain("verify_determination");
  });

  it("repair orchestration is planner-scoped and uses subagent control tools", () => {
    const repair = getSkill("repair_orchestration");
    expect(repair.role).toBe("planner");
    expect(repair.allowedToolIds).toEqual(
      expect.arrayContaining(["spawn_subagents", "send_subagent_message", "wait_for_subagents", "cancel_subagent"]),
    );
  });

  it("every skill inherits the universal tools", () => {
    for (const skill of skillRegistry) {
      const all = allToolIdsForSkill(skill);
      for (const universal of universalHarnessToolIds) {
        expect(all).toContain(universal);
      }
    }
  });

  it("the validator catches an out-of-scope tool (system reaching for a researcher tool)", () => {
    const bad: SkillDefinition = {
      id: "freshness_sweep",
      title: "bad",
      role: "system",
      trigger: "x",
      allowedToolIds: ["fetch_source"],
      doneCondition: "x",
    };
    const errors = validateSkillRegistry([bad]);
    expect(errors).toContainEqual({ skillId: "freshness_sweep", toolId: "fetch_source", reason: "out_of_scope" });
  });

  it("the validator catches an unknown tool id (e.g. the legacy spawn_agents name)", () => {
    const bad = {
      id: "planning",
      title: "bad",
      role: "planner",
      trigger: "x",
      allowedToolIds: ["spawn_agents"],
      doneCondition: "x",
    } as unknown as SkillDefinition;
    const errors = validateSkillRegistry([bad]);
    expect(errors).toContainEqual({ skillId: "planning", toolId: "spawn_agents", reason: "unknown_tool" });
  });
});
