# EHS Agent Control Loop - Team Contract

Updated: 2026-05-30
Home repo: https://github.com/a1gmm/Autoresearch-Systems-Hackathon-Antler
Audience: hackathon teammates
Status: implementation contract

## Goal

Turn the team-agreed agent loop into a concrete control-loop contract that can be implemented and demoed.

Team-agreed loop:

```
customer intake
  -> orchestrator narrows scope
  -> orchestrator creates theses/hypotheses
  -> as many scoped specialist agents as needed to research each hypothesis
  -> verifier checks results
  -> failed results return for repair/research
  -> passing results synthesize into report
  -> memory updates
  -> agents run in a harness with tools and skills
```

CEO-level correction:

> This must be artifact-driven, not conversation-driven.

Every stage should produce typed objects that can be stored, traced, verified, retried, and shown in the demo.

## Final Loop

```
CUSTOMER INTAKE
  |
  v
+------------------------------+
| Scope Agent                  |
| Output: ScopePack            |
| - facility facts             |
| - project/change facts       |
| - missing facts              |
| - assumptions                |
+--------------+---------------+
               |
               v
+------------------------------+
| Orchestrator                 |
| Output: ResearchPlan         |
| - coverage family statuses   |
| - regulatory angles          |
| - specific hypotheses        |
| - task graph                 |
| - budgets                    |
+--------------+---------------+
               |
               v
+-----------------------------------------------------+
| Dynamic Research Fan-Out                              |
| N workers by specific hypotheses, source checks,      |
| missing-fact blockers, and discovery candidates       |
| Output: EvidenceBundle[]                              |
+----------------------+------------------------------+
                       |
                       v
+------------------------------+
| Verification Agent           |
| Output: VerificationVerdict  |
| - pass/fail per check        |
| - confidence                 |
| - repair tickets             |
+--------------+---------------+
               |
     fail      |      pass / needs-review
   +-----------+-----------+
   |                       |
   v                       v
+------------------+   +------------------------------+
| Repair Loop      |   | Synthesis Agent              |
| max 2 attempts   |   | Output: Matrix + Report      |
| repair query,    |   | - determinations             |
| source, extract, |   | - citations                  |
| or hypothesis    |   | - review flags               |
+--------+---------+   +--------------+---------------+
         |                            |
         +----------------------------+
                         |
                         v
+------------------------------+
| Memory Writer                |
| Output: GatedMemoryWrite[]   |
| Only writes verified facts,  |
| failed hypotheses, source    |
| hashes, and run metrics      |
+------------------------------+
```

## Rule Of The System

The orchestrator owns planning. The verifier owns truth.

Researchers are dynamic workers, not a fixed team size. The orchestrator should spawn as many as the scoped task graph requires, then enforce budgets, dedupe, and verification. Researchers can propose conclusions. They cannot make the final determination trustworthy by themselves. Trust comes from evidence plus verification.

Coverage families are not hypotheses. They are completeness guards. The planner must inspect broad EHS families, then create more specific regulatory angles and research hypotheses only when project facts justify them.

```text
CoverageFamily
  -> RegulatoryAngle
    -> ResearchHypothesis
      -> ResearchTask
        -> EvidenceBundle
```

This keeps the product from becoming a fixed six-domain checklist. A simple project may inspect all families but activate only a few angles. A complex project can expand into many angles and source-check tasks.

## Required Typed Artifacts

### 1. `ScopePack`

Produced by: Scope Agent
Consumed by: Orchestrator

```json
{
  "run_id": "run_123",
  "facility": {
    "address": "string",
    "jurisdiction_stack": ["SCAQMD", "California Water Boards", "Local CUPA"],
    "naics": "string|null",
    "sic": "string|null"
  },
  "project_change": {
    "description": "string",
    "equipment": [],
    "chemicals": [],
    "waste_streams": [],
    "disturbance_acres": "number|null"
  },
  "missing_facts": [
    {
      "field": "naics",
      "why_needed": "Industrial stormwater coverage depends on SIC/NAICS.",
      "blocks": ["industrial_stormwater"]
    }
  ],
  "assumptions": [
    {
      "claim": "Facility is in SCAQMD jurisdiction.",
      "basis": "Seeded demo resolver.",
      "confidence": 0.8
    }
  ]
}
```

### 2. `CoverageFamilyStatus`

Produced by: Orchestrator
Consumed by: Orchestrator, Trace UI, Synthesis Agent

```json
{
  "id": "CF-AIR",
  "family": "air",
  "status": "active",
  "reason": "Project adds a coating booth, which may be new emitting equipment.",
  "project_facts_considered": ["new coating booth", "SCAQMD jurisdiction"],
  "missing_facts": [],
  "next": ["create_regulatory_angles"]
}
```

Valid statuses:

- `active`
- `blocked_missing_fact`
- `out_of_scope`
- `discovery_candidate`

### 3. `RegulatoryAngle`

Produced by: Orchestrator
Consumed by: Orchestrator, Research Workers

```json
{
  "id": "A-AIR-EMITTING-EQUIPMENT",
  "family": "air",
  "label": "New or modified emitting equipment",
  "reason": "A coating booth may emit regulated pollutants and require authorization before construction or operation.",
  "triggering_facts": ["coating booth", "solvent use", "SCAQMD jurisdiction"],
  "status": "active"
}
```

### 4. `ResearchHypothesis`

Produced by: Orchestrator
Consumed by: Research Workers

```json
{
  "id": "H-AIR-001",
  "angle_id": "A-AIR-EMITTING-EQUIPMENT",
  "question": "Does the new coating booth require an SCAQMD Permit to Construct?",
  "claim_to_test": "The new coating booth may require an SCAQMD Permit to Construct before installation.",
  "family": "air",
  "triggering_facts": ["new emitting equipment", "SCAQMD jurisdiction"],
  "required_facts": ["equipment type", "jurisdiction", "emissions or exemption facts"],
  "expected_source_type": "regulation",
  "must_find": [
    "current primary source for permit trigger",
    "exemption or exclusion rule",
    "agency portal or human filing destination"
  ],
  "acceptance_criteria": [
    "official or high-authority source",
    "quote contains trigger or exemption language",
    "predicate evaluation is reproducible"
  ],
  "status": "open"
}
```

### 5. `ResearchTask`

Produced by: Orchestrator
Consumed by: Harness

```json
{
  "task_id": "T-AIR-001",
  "hypothesis_id": "H-AIR-001",
  "assigned_agent": "air_researcher",
  "allowed_tools": [
    "official_web_fetch",
    "pdf_extract",
    "source_ranker",
    "citation_extractor"
  ],
  "blocked_tools": [
    "memory_write",
    "final_report_write"
  ],
  "budget": {
    "max_sources": 5,
    "max_runtime_seconds": 90,
    "max_model_calls": 6
  }
}
```

Fan-out rule:

```json
{
  "spawn_policy": {
    "unit": "one worker per specific hypothesis or source-check subtask",
    "scale_with": ["active_regulatory_angles", "jurisdiction", "source_count", "uncertainty"],
    "min_workers": "enough tasks to represent every inspected coverage family status",
    "max_workers": "bounded by runtime/model/source budgets"
  }
}
```

Examples:

- Simple tenant improvement: 4-6 workers.
- Facility adding one emitting unit and one chemical: 8-12 workers.
- Complex EV battery recycling project: 25+ workers.

Do not hardcode a fixed agent count. Hardcode the roles, schemas, budgets, and verification gates.

### 6. `EvidenceBundle`

Produced by: Research Workers
Consumed by: Verification Agent

```json
{
  "hypothesis_id": "H-AIR-001",
  "sources": [
    {
      "url": "https://official-source.example/rule",
      "authority_rank": 1,
      "fetched_at": "2026-05-30T00:00:00Z",
      "content_hash": "sha256:...",
      "effective_date": "date|null",
      "quote": "verbatim source text",
      "quote_anchor": {
        "start": 1024,
        "end": 1210
      }
    }
  ],
  "extracted_claims": [
    {
      "field": "permit_trigger",
      "value": "written authorization required before construction/modification",
      "source_url": "https://official-source.example/rule",
      "quote": "verbatim supporting quote",
      "confidence": 0.86
    }
  ],
  "researcher_conclusion": "applies|does_not_apply|needs_review",
  "uncertainties": []
}
```

### 7. `VerificationVerdict`

Produced by: Verification Agent
Consumed by: Orchestrator and Synthesis Agent

```json
{
  "hypothesis_id": "H-AIR-001",
  "verdict": "pass|fail|needs_review",
  "checks": {
    "currency": {
      "pass": true,
      "reason": "source fetched this run"
    },
    "authority": {
      "pass": true,
      "reason": "official agency source"
    },
    "grounding": {
      "pass": true,
      "reason": "quote contains trigger clause"
    },
    "predicate_math": {
      "pass": true,
      "reason": "customer facts satisfy threshold"
    },
    "cross_source": {
      "pass": false,
      "reason": "not required for this demo row"
    }
  },
  "confidence": 0.84,
  "repair_tickets": []
}
```

### 8. `RepairTicket`

Produced by: Verification Agent
Consumed by: Orchestrator

```json
{
  "ticket_id": "R-AIR-001",
  "hypothesis_id": "H-AIR-001",
  "failure_type": "grounding_failed",
  "failed_check": "grounding",
  "observed_problem": "Extracted claim was not supported by quoted text.",
  "repair_action": "rerun extraction with quote-constrained prompt",
  "max_attempts_remaining": 1
}
```

### 9. `Determination`

Produced by: Synthesis Agent
Consumed by: UI/report

```json
{
  "requirement": "SCAQMD Permit to Construct",
  "applies": "yes|no|needs_review",
  "trigger": "new equipment that may emit air contaminants",
  "trigger_value": {},
  "citation": {
    "source_url": "https://official-source.example/rule",
    "source_name": "official agency rule",
    "as_of_date": "2026-05-30",
    "quote": "verbatim source text",
    "content_hash": "sha256:..."
  },
  "confidence": 0.84,
  "verified": true,
  "review_flag": false,
  "review_reason": null,
  "agency_portal": "human filing destination",
  "deadline_cadence": "one-time|annual|unknown"
}
```

### 10. `GatedMemoryWrite`

Produced by: Memory Writer
Consumed by: durable memory/store

```json
{
  "memory_type": "verified_source_fact|failed_hypothesis|run_metric",
  "fact": "string",
  "source_url": "string|null",
  "content_hash": "sha256|null",
  "quote": "string|null",
  "verifier_verdict": "pass|fail|needs_review",
  "as_of_date": "date|null",
  "expires_or_recheck_after": "date|null"
}
```

## Harness Contract

The harness controls safety, budgets, tool access, trace visibility, and retry behavior.

Required harness features:

| Feature | Requirement |
|---|---|
| Run IDs | Every artifact has one `run_id`. |
| Tool allowlists | Each agent only receives the tools it needs. |
| Schema validation | Invalid JSON becomes a repair ticket or failed task. |
| Budgets | Each task has max sources, runtime, and model calls. |
| Source cache | Demo uses cached fetched sources when live fetch fails. |
| Trace events | Every artifact transition appears in the UI trace. |
| Human-review state | Unverified rows remain visible as `Needs-review`. |

Recommended permissions:

| Agent Template | Allowed | Blocked |
|---|---|---|
| Scope Agent | intake parser, address resolver, missing-fact generator | final report, memory write |
| Orchestrator | task planner, agent spawn, repair dispatcher, trace write | direct memory write, final truth decision |
| Research Worker | official web fetch, PDF extract, source ranker, citation extractor | final report, durable memory |
| Verifier | source reader, quote checker, schema validator, predicate evaluator | broad browsing unless cross-check needed |
| Synthesis Agent | verified verdicts, matrix/report renderer | unverified source fetch |
| Memory Writer | verified report, source hashes, run metrics | unverified discoveries |

## Repair Loop

Repair should fix the run, not mutate global skills.

Allowed repair actions:

- rerun source fetch with fallback URL,
- rerun extraction with quote-constrained prompt,
- request missing intake fact,
- split hypothesis into smaller hypotheses,
- lower confidence and mark `Needs-review`.

Blocked for hackathon:

- mutating agent skills live,
- writing new trusted rules directly to durable memory,
- unbounded recursive spawning with no scope budget.

Rules:

```
max_attempts_per_hypothesis = 2
max_total_repair_cycles = 1 for the demo
if still failing -> terminal Needs-review
```

## Coverage Floor

The orchestrator must always inspect the same families before spawning specific work:

```json
["air", "stormwater", "hazmat", "waste", "wastewater"]
```

For each family, output one of:

- `active`: project facts justify one or more regulatory angles,
- `blocked_missing_fact`: a required fact blocks determination,
- `out_of_scope`: inspected with reason and no active work,
- `discovery_candidate`: possible unseeded issue requiring human review.

This is what prevents the system from only researching what the customer already knew to ask.

## Memory Rules

Memory is useful only if it is provenance-bound.

Allowed:

| Memory | Example |
|---|---|
| Verified source fact | source URL, quote, hash, verifier pass. |
| Failed hypothesis | rejected because grounding failed. |
| User/project fact | address, NAICS, project change from intake. |
| Run metric | latency, pass/fail counts, eval result. |

Blocked:

| Memory | Why |
|---|---|
| Unverified discovered law | Can poison future runs. |
| Unconditional legal rule | Applicability depends on jurisdiction and facts. |
| Raw source text without hash/date | Cannot be trusted later. |
| Live self-repair patch | Not reproducible in a demo. |

## Failure Modes

| Codepath | Failure | Required Behavior |
|---|---|---|
| Intake | Customer gives vague scope. | Ask targeted missing-fact questions and record blockers. |
| Hypotheses | Orchestrator misses a regulatory family. | Coverage floor still emits a family status. |
| Research | Agents duplicate work. | De-dupe by `hypothesis_id + source_url`. |
| Source fetch | Official source fails. | Retry once, fallback to cache, mark unable-to-verify if needed. |
| Extraction | Invalid JSON. | Schema validation failure and repair ticket. |
| Verification | Quote does not support claim. | Grounding fail and `Needs-review`. |
| Repair | Loop repeats same failure. | Stop after max attempts. |
| Synthesis | Unverified claim enters final report. | Block: synthesis only treats verifier pass as verified. |
| Memory | Candidate law becomes trusted. | Block: memory writer denies unverified discoveries. |
| UI | Swarm trace hidden. | Block: trace panel is part of MVP. |

## Implementation Tasks

- [ ] Define all artifact schemas.
- [ ] Implement Scope Agent output as `ScopePack`.
- [ ] Implement orchestrator coverage floor with `CoverageFamilyStatus`.
- [ ] Implement `RegulatoryAngle`, `ResearchHypothesis`, and `ResearchTask` creation.
- [ ] Implement dynamic researcher fan-out where each worker outputs an `EvidenceBundle`.
- [ ] Implement verifier output as `VerificationVerdict`.
- [ ] Implement bounded `RepairTicket` loop.
- [ ] Implement synthesis from verified or flagged verdicts only.
- [ ] Implement gated memory writer.
- [ ] Render dynamic worker count and artifact transitions in the UI trace panel.

## Team Decision

Use the linear pipeline with visible dynamic parallel research tasks for the hackathon.

Do not build a fully recursive swarm first. It is more exciting on paper but higher risk. The demo should prove:

1. the orchestrator can form hypotheses,
2. the planner can expand coverage families into specific regulatory angles,
3. the harness can spawn as many research workers as the scoped task graph needs,
4. verifier can reject bad evidence,
5. the system can repair once,
6. final report shows only verified or clearly flagged determinations.

That is enough to look like a real autonomous research system.
