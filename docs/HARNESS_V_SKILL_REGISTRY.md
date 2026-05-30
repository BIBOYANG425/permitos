# Harness V — Skill Registry

Companion to `HARNESS_V_TOOL_CATALOG.md`. The tool catalog is the **tool → roles**
view; this registry is the inverse **role → capability (skill)** view. Source of
truth: `src/lib/research/skillRegistry.ts`, kept honest by
`validateSkillRegistry()` (tests in `__tests__/skillRegistry.test.ts`).

A **skill** is a scoped agent capability with: a trigger, an allowed toolset
(enforced by the catalog's role scoping), and a done/handoff condition. Universal
tools (`send_message`, `log_step`, `emit_trace_event`, `validate_artifact_schema`,
`escalate_to_human`) are inherited by every skill and not relisted per skill.

## Registry (10 skills)

| Skill | Role | Trigger (short) | Done |
|---|---|---|---|
| Intake & Completeness | `intake` | new project / decision-blocking gap | gate ready or escalate |
| Planning & Jurisdiction | `planner` | intake ready | researchers spawned |
| Triage (coverage floor) | `triage` | alongside planning | candidate set complete at breadth |
| Research | `researcher` | spawned with one task | grounded determination or review flag |
| Verification (4 levels) | `verifier` | determination / set ready | verdict + confidence; doubtful → review flag |
| Discovery | `discovery` | no map entry / no form | regime/form staged for approval |
| Synthesis & Output | `synthesizer` | set verified | passes schema gate |
| Escalation & Handoff | `synthesizer`* | review flag / below τ | licensed human holds package |
| **Repair Orchestration** | `planner` | a RepairTicket exists | repaired → synth, exhausted → escalate |
| Freshness Sweep | `system` | scheduled (cron) | sources re-checked, determinations re-flagged |

\* Escalation is a pipeline phase owned by the synthesizer, but `escalate_to_human`
is **universal** — any skill may escalate ad hoc (`crossCutting: true`).

## Validator findings it resolves

Encoding the skills doc as a validated registry mechanically fixed three drifts
between the prose doc and the catalog:

1. **`spawn_agents` → `spawn_subagents`.** The prose used the legacy name; the
   catalog standardized on `spawn_subagents` (+ `send_subagent_message`,
   `wait_for_subagents`, `cancel_subagent`). The registry uses the catalog name;
   `validateSkillRegistry` flags the old one as `unknown_tool`.
2. **Escalation is not a 7th agent role.** `escalate_to_human` is universal, so
   escalation is a cross-cutting capability, not a scoped role. Modeled as a
   synthesizer-phase skill with `crossCutting: true`.
3. **Freshness sweep scope.** The prose had the `system` sweep calling
   `fetch_source` / `extract_threshold` / `verify_determination` / `set_review_flag`
   — all scoped to `researcher`/`verifier`, which the validator rejects for
   `system`. Resolution: the sweep holds only `freshness_sweep` (crawl + diff +
   re-flag); re-extract/re-verify happen by the **re-flagged determinations
   re-entering the normal Research/Verification pipeline** (delegation), keeping the
   safety boundary intact.

## Are more skills needed? (gap analysis)

**Added beyond the source doc's S0–S8:**
- **Repair Orchestration** (`planner`). The system already runs a bounded repair
  loop (the HMBP fail → repair demo), but the source doc folded it into the
  verification→feedback arrow. It has a distinct trigger (a `RepairTicket`) and
  done-condition (repaired, or escalate after the attempt budget), and it maps
  cleanly to the planner's subagent-control tools. Made first-class.

**Recommended next, but NOT added yet (needs new catalog tools first):**
- **Gated Memory Writer.** The control-loop contract and the harness memory model
  (short-term = Redis, episodic = Postgres, semantic = Vector DB) call for writing
  *only verified* facts to durable/semantic memory. There is **no memory-write tool
  in the catalog today**, so a memory skill can't be validated yet. Adding it means
  first adding a `write_gated_memory` tool (scoped to a `memory` role, writes gated
  on a passing verdict) — then a skill. Flagged, not invented.

**Considered and rejected as skills (they are universal capabilities, not phases):**
- Logging/tracing (`log_step`, `emit_trace_event`), schema validation
  (`validate_artifact_schema`), status messaging (`send_message`). These are
  inherited by every skill via `allToolIdsForSkill`; making them separate skills
  would be miscategorization.

## Build note

Each skill = an agent definition with a fixed allowed toolset. Wire `skillsForRole`
+ `allToolIdsForSkill` into the agent runtime so tool scoping is enforced by the
harness, not the model. `validateSkillRegistry()` belongs in CI so the registry and
catalog can never silently drift.
