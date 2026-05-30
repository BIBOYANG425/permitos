# Harness V Tool Catalog

Updated: 2026-05-30

This is the bridge between the proposed agent internals doc and the system that exists in this repo today.

## Existing System

Already implemented:

- Typed artifacts: `ScopePack`, `ResearchHypothesis`, `ResearchTask`, `EvidenceBundle`, `VerificationVerdict`, `RepairTicket`, and `Determination`.
- Deterministic vertical slice: seeded intake, scoped hypotheses, one task per hypothesis, worker evidence, verifier failure, HMBP repair, and final matrix.
- Modal adapter: `USE_MODAL=1` swaps the local worker pool for one Modal CLI run per task.
- UI replay: trace events drive the sandbox grid and then hand off to the research graph.

Current gaps:

- Tool names were only labels on `ResearchTask`, not an enforceable harness contract.
- Safe retrieval was represented by fixtures, not by allowlisted source pointers, currency proof, and injection quarantine.
- Form selection was not modeled yet.
- Audit log and trace events were separate ideas; Harness V treats them as one required observability boundary.
- Subagent lifecycle was under-specified: spawning was named, but message, wait, and cancellation primitives were missing.

## Harness V Decision

Keep the current deterministic slice as the demo fallback, then evolve the harness around four hard gates:

1. Intake can only proceed when schema, coverage, value-of-information, and confidence gates say the remaining unknowns cannot flip the permit set.
2. Research workers can only fetch allowlisted official sources or form registry rows.
3. The verification harness owns truth across four levels: claim, consistency, set coverage, and process trace.
4. Synthesizers can only select human-verified forms; there is no form-generation tool.

## Tool Catalog Source Of Truth

The source of truth is now [src/lib/research/toolCatalog.ts](/Users/mac/Documents/antler/src/lib/research/toolCatalog.ts).

It defines:

- tool categories,
- write targets,
- agent-role scopes,
- universal harness tools,
- subagent control tools,
- safe researcher tool allowlists,
- researcher blocked tools,
- `isToolScopedToRole(tool_id, role)` for executor-side rejection.

`ResearchTask.allowed_tools` is typed to catalog ids, and [src/lib/research/planner.ts](/Users/mac/Documents/antler/src/lib/research/planner.ts) now populates task tools from the catalog instead of hand-written string labels.

## Universal Harness Tools

These tools belong in every agent context because they make the run inspectable and controllable without granting domain authority:

| Tool | Why it is universal |
| --- | --- |
| `log_step` | Required audit trail for every meaningful action. |
| `emit_trace_event` | UI and replay visibility for artifact transitions and worker lifecycle. |
| `validate_artifact_schema` | Prevents malformed artifacts from crossing agent boundaries. |
| `send_message` | Controlled status or human-review messaging without changing determinations. |
| `escalate_to_human` | Hard boundary for review-flagged or low-confidence cases. |

Under-mentioned subagent primitives now called out explicitly:

| Tool | Scope |
| --- | --- |
| `spawn_subagents` | Planner creates bounded workers from `ResearchTask[]`. |
| `send_subagent_message` | Planner sends scoped task input, repair instructions, or cancellation notices. |
| `wait_for_subagents` | Planner joins worker results while preserving task ids and failure states. |
| `cancel_subagent` | Planner/system stops workers that exceed budget or become irrelevant. |

## Verification Harness Levels

The verification harness is a child harness governed by the parent harness. It is not a single agent judging whether its own answer sounds plausible. It attaches checks to artifacts that have external or deterministic evidence.

| Level | Artifact | Question | Tool |
| --- | --- | --- | --- |
| 1. Claim verification | `Determination` or `EvidenceBundle` | Does this one permit-applies claim hold up against dates, authority, quote grounding, predicate math, and a second source? | `verify_determination` |
| 2. Consistency verification | Determination run variants | Does the permit set stay stable under varied phrasing and order, or does a missing fact flip the answer? | `self_consistency` |
| 3. Set/coverage verification | Candidate program set and family statuses | Did every candidate program receive an explicit disposition, including exemption-exceptions and narrative catch-alls? | `verify_determination_set` |
| 4. Process/trace verification | Audit log and trace events | Did the system actually fetch, hash, quote, verify, and select forms as claimed? | `verify_process_trace` |

The weakest acceptable signal is model confidence. The strongest signals are deterministic dates, hashes, schema validity, registry membership, fetched quote spans, cross-source agreement, and eval outcomes.

Hard rules:

- The model is never the sole judge of dates, hashes, schema validity, fetched-source existence, or form registry membership.
- Claim verification alone is insufficient because the worst permit failure is omission.
- Set verification must check the negative space: no silent family drops, no candidate program without an applies/does-not-apply/needs-review disposition, and no ignored exemption-exception.
- Process verification is mechanical: no `applies=true` row can cite a source that was never fetched, use a quote that was never extracted, or emit a form that is not a human-verified registry row.
- Honest uncertainty is a pass of the verification system. If currency or coverage cannot be confirmed, the right output is `needs_review` or human escalation.

## Flow

```text
intake
  -> intake_completeness_gate
  -> resolve_jurisdiction
  -> map_query_programs
  -> spawn_subagents
       -> get_triggers
       -> get_source_pointers
       -> get_cached_source or fetch_source
       -> prove_currency
       -> extract_threshold
       -> evaluate_predicate
       -> quarantine_injection on every fetched page
  -> verify_determination
  -> self_consistency if the permit set is unstable
  -> verify_determination_set
  -> verify_process_trace
  -> set_review_flag or repair
  -> get_form
  -> schema_gate
  -> build_applicability_matrix
  -> assemble_review_package
```

Every step emits `log_step` and `emit_trace_event`.

## Near-Term Modification Path

The next code slice should add executable stubs around the catalog, not jump straight to live law retrieval:

1. Add a `HarnessToolExecutor` interface that receives `tool_id`, `agent_role`, and typed input.
2. Reject any tool call where `tool_id` is not scoped to `agent_role`.
3. Route current fixtures through `get_cached_source`, `prove_currency`, `extract_threshold`, and `evaluate_predicate` stubs.
4. Add a small `forms` fixture registry and make synthesis select `get_form` only for verified applicable rows.
5. Add audit-log events beside existing trace events so the UI can stay simple while the harness becomes defensible.
6. Add `verify_determination_set` and `verify_process_trace` stubs before live retrieval so omission and shortcut failures are visible in cached replay.

## Acceptance

- Every `ResearchTask.allowed_tools` id exists in the catalog.
- Research workers have safe retrieval tools and universal harness tools, but not form selection or synthesis tools.
- Planner/system owns subagent lifecycle tools.
- Verifier owns claim, consistency, set, and process verification tools.
- Any form row used in client-facing output must be selected from a registry and human-verified.
- Any current-law claim without currency proof or quote grounding becomes `needs_review`.
