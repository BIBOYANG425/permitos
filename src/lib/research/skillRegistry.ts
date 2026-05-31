import {
  type AgentRole,
  type HarnessToolId,
  harnessToolCatalog,
  isToolScopedToRole,
  researcherCoreToolIds,
  universalHarnessToolIds,
} from "./toolCatalog";

// A skill is a scoped agent capability: a trigger, an allowed toolset (enforced
// by the harness via the tool catalog's role scoping), and a done/handoff
// condition. This registry is the role->capability view; toolCatalog.ts is the
// inverse tool->roles view. validateSkillRegistry() keeps the two from drifting.

export type SkillId =
  | "intake"
  | "planning"
  | "triage"
  | "research"
  | "verification"
  | "discovery"
  | "synthesis"
  | "escalation"
  | "repair_orchestration"
  | "freshness_sweep";

export type SkillDefinition = {
  id: SkillId;
  title: string;
  role: AgentRole;
  trigger: string;
  // Skill-distinctive scoped tools. Universal tools (send_message, log_step,
  // emit_trace_event, validate_artifact_schema, escalate_to_human) are available
  // to every skill and are not relisted here — see allToolIdsForSkill().
  allowedToolIds: HarnessToolId[];
  doneCondition: string;
  // escalation is owned by the synthesizer as a pipeline phase, but its core
  // tool (escalate_to_human) is universal — any skill may escalate ad hoc.
  crossCutting?: boolean;
};

export const skillRegistry: readonly SkillDefinition[] = [
  {
    id: "intake",
    title: "Intake & Completeness",
    role: "intake",
    trigger:
      "A new project/change is submitted, or a downstream skill reports a decision-blocking data gap that needs the user.",
    allowedToolIds: ["normalize_attributes", "lookup_naics_sic", "intake_completeness_gate", "ask_user"],
    doneCondition:
      "The completeness gate returns ready (no open decision-relevant TBD above the confidence bar) or escalates; normalized attributes hand off to Planning.",
  },
  {
    id: "planning",
    title: "Planning & Jurisdiction Resolution",
    role: "planner",
    trigger: "Intake returns ready.",
    allowedToolIds: ["resolve_jurisdiction", "map_query_programs", "lookup_naics_sic", "spawn_subagents"],
    doneCondition: "One Researcher is spawned per worklist task; hands off to Researchers and Triage.",
  },
  {
    id: "triage",
    title: "Triage (Coverage Floor)",
    role: "triage",
    trigger: "Runs alongside planning, before deep research commits.",
    allowedToolIds: ["map_query_programs"],
    doneCondition: "The candidate program set is confirmed complete at breadth; gaps feed back to Planning.",
  },
  {
    id: "research",
    title: "Research (Retrieve, Prove Currency, Ground)",
    role: "researcher",
    trigger: "Spawned by Planning with one investigation task.",
    allowedToolIds: [...researcherCoreToolIds],
    doneCondition:
      "The task has a determination (applies + trigger value + cited source + verbatim quote + confidence) or a review flag; hands off to Verification.",
  },
  {
    id: "verification",
    title: "Verification (4 levels)",
    role: "verifier",
    trigger: "A researcher emits a determination, or a determination set is assembled.",
    allowedToolIds: [
      "verify_determination", // Level 1 — claim
      "self_consistency", // Level 2 — consistency
      "verify_determination_set", // Level 3 — set / coverage
      "verify_process_trace", // Level 4 — process / trace
      "crosscheck_source",
      "prove_currency",
      "run_eval_set",
      "set_review_flag",
    ],
    doneCondition:
      "Every determination has a verdict + calibrated confidence; doubtful ones carry a review flag; hands off to Synthesis.",
  },
  {
    id: "discovery",
    title: "Discovery (handles novel projects)",
    role: "discovery",
    trigger: "A project attribute maps to no program, or no official form exists for a determined program.",
    allowedToolIds: ["discover_regime", "propose_map_entry", "propose_form_entry"],
    doneCondition:
      "The regime/form is staged for human approval and a provisional (review-flagged) determination is produced.",
  },
  {
    id: "synthesis",
    title: "Synthesis & Output",
    role: "synthesizer",
    trigger: "The determination set is verified.",
    allowedToolIds: [
      "get_form",
      "schema_gate",
      "build_applicability_matrix",
      "generate_compliance_calendar",
      "assemble_review_package",
    ],
    doneCondition: "The package passes the schema gate; review-flagged -> Escalation, else client-facing.",
  },
  {
    id: "escalation",
    title: "Escalation & Human Handoff",
    role: "synthesizer",
    trigger:
      "Any review flag, confidence below threshold, unresolvable conflict, or a determination hinging on an exemption-exception.",
    allowedToolIds: ["assemble_review_package", "escalate_to_human"],
    doneCondition: "A licensed human holds the review package; out of agent scope past this point.",
    crossCutting: true,
  },
  {
    id: "repair_orchestration",
    title: "Repair Orchestration",
    role: "planner",
    trigger: "Verification emits a RepairTicket (a failed grounding/currency check within the bounded repair budget).",
    allowedToolIds: ["spawn_subagents", "send_subagent_message", "wait_for_subagents", "cancel_subagent"],
    doneCondition:
      "A scoped repair worker reruns only the failed step; pass -> Synthesis, exhausted attempts -> review flag / escalate.",
  },
  {
    id: "freshness_sweep",
    title: "Freshness Sweep (self-updating knowledge base)",
    role: "system",
    trigger: "Scheduled (cron), not per-project.",
    // Delegation model: the system sweep crawls + diffs + re-flags via the single
    // freshness_sweep tool. Re-extract / re-verify are NOT called directly here
    // (those tools are scoped to researcher/verifier); re-flagged determinations
    // re-enter the normal Research/Verification pipeline.
    allowedToolIds: ["freshness_sweep"],
    doneCondition:
      "All sources re-checked; affected determinations re-flagged, re-entering them into the Research/Verification pipeline.",
  },
];

export type SkillValidationError = {
  skillId: SkillId;
  toolId: string;
  reason: "unknown_tool" | "out_of_scope";
};

// Asserts every tool a skill claims is real and actually scoped to that skill's
// role (universal tools pass for any role). This mechanically catches drift such
// as the legacy `spawn_agents` name or a system skill reaching for researcher tools.
export function validateSkillRegistry(
  registry: readonly SkillDefinition[] = skillRegistry,
): SkillValidationError[] {
  const errors: SkillValidationError[] = [];
  const known = new Set<string>(harnessToolCatalog.map((tool) => tool.id));
  for (const skill of registry) {
    for (const toolId of skill.allowedToolIds) {
      if (!known.has(toolId)) {
        errors.push({ skillId: skill.id, toolId, reason: "unknown_tool" });
        continue;
      }
      if (!isToolScopedToRole(toolId, skill.role)) {
        errors.push({ skillId: skill.id, toolId, reason: "out_of_scope" });
      }
    }
  }
  return errors;
}

export function getSkill(id: SkillId): SkillDefinition {
  const skill = skillRegistry.find((entry) => entry.id === id);
  if (!skill) {
    throw new Error(`Unknown skill: ${id}`);
  }
  return skill;
}

export function skillsForRole(role: AgentRole): SkillDefinition[] {
  return skillRegistry.filter((skill) => skill.role === role);
}

// Full callable toolset for a skill = its scoped tools plus the universal tools
// every agent inherits.
export function allToolIdsForSkill(skill: SkillDefinition): HarnessToolId[] {
  return [...new Set<HarnessToolId>([...universalHarnessToolIds, ...skill.allowedToolIds])];
}
