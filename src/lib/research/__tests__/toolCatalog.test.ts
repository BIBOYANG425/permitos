import { describe, expect, it } from "vitest";
import { seededComplexScope } from "../fixtures/scenarios";
import { planResearch } from "../planner";
import {
  harnessToolCatalog,
  isToolScopedToRole,
  researchWorkerToolIds,
  subagentControlToolIds,
  toolIdsForRole,
  universalHarnessToolIds
} from "../toolCatalog";

describe("harness tool catalog", () => {
  it("keeps tool ids unique", () => {
    const ids = harnessToolCatalog.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the universal harness and subagent control primitives", () => {
    expect(universalHarnessToolIds).toEqual(
      expect.arrayContaining([
        "log_step",
        "emit_trace_event",
        "validate_artifact_schema",
        "send_message",
        "escalate_to_human"
      ])
    );
    expect(subagentControlToolIds).toEqual(
      expect.arrayContaining([
        "spawn_subagents",
        "send_subagent_message",
        "wait_for_subagents",
        "cancel_subagent"
      ])
    );
  });

  it("scopes researcher workers to safe retrieval tools plus universal harness tools", () => {
    const researcherTools = toolIdsForRole("researcher");
    const workerTools = researchWorkerToolIds();

    expect(workerTools).toEqual(
      expect.arrayContaining([
        "get_source_pointers",
        "fetch_source",
        "prove_currency",
        "extract_threshold",
        "evaluate_predicate",
        "quarantine_injection",
        "log_step",
        "send_message"
      ])
    );
    expect(workerTools.every((toolId) => researcherTools.includes(toolId))).toBe(true);
    expect(workerTools).not.toContain("get_form");
    expect(workerTools).not.toContain("build_applicability_matrix");
  });

  it("rejects tools outside a role scope", () => {
    expect(isToolScopedToRole("fetch_source", "researcher")).toBe(true);
    expect(isToolScopedToRole("fetch_source", "synthesizer")).toBe(false);
    expect(isToolScopedToRole("send_message", "synthesizer")).toBe(true);
    expect(isToolScopedToRole("spawn_subagents", "researcher")).toBe(false);
  });

  it("separates claim, set, and process verification tools", () => {
    const verifierTools = toolIdsForRole("verifier");

    expect(verifierTools).toEqual(
      expect.arrayContaining([
        "verify_determination",
        "self_consistency",
        "verify_determination_set",
        "verify_process_trace",
        "run_eval_set"
      ])
    );
    expect(isToolScopedToRole("verify_determination_set", "researcher")).toBe(false);
    expect(isToolScopedToRole("verify_process_trace", "system")).toBe(true);
  });

  it("plans research tasks with cataloged tool ids", () => {
    const catalogIds = new Set<string>(harnessToolCatalog.map((tool) => tool.id));
    const plan = planResearch(seededComplexScope("run_tools", "demo"));

    expect(plan.research_tasks.length).toBeGreaterThanOrEqual(5);
    for (const task of plan.research_tasks) {
      expect(task.allowed_tools.length).toBeGreaterThan(0);
      expect(task.allowed_tools.every((toolId) => catalogIds.has(toolId))).toBe(true);
      expect(task.allowed_tools).toEqual(expect.arrayContaining(universalHarnessToolIds));
      expect(task.blocked_tools.every((toolId) => catalogIds.has(toolId))).toBe(true);
      expect(task.blocked_tools).toContain("get_form");
    }
  });
});
