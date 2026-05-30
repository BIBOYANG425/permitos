# Two-Person Build Split

Updated: 2026-05-30
Home repo: https://github.com/a1gmm/Autoresearch-Systems-Hackathon-Antler
Decision: User does Person A. Teammate does Person B.

## Goal

Build the Dynamic Research Graph MVP fast enough for a hackathon demo.

The product proof is:

```text
Project facts
  -> coverage families inspected
  -> regulatory angles generated
  -> specific hypotheses created
  -> source tasks fan out
  -> evidence bundles return
  -> verifier rejects weak evidence
  -> repair ticket runs
  -> final matrix shows verified rows and needs-review rows
```

Coverage families are not hypotheses. They are only completeness guards. Specific research questions live under regulatory angles.

## Shared Contract First

Before either person builds their own part, agree on these TypeScript artifacts. This is the shared API between backend logic and UI.

```ts
type RunStatus = "idle" | "queued" | "running" | "partial" | "needs_review" | "done" | "failed";

type CoverageFamily =
  | "air"
  | "stormwater"
  | "hazmat"
  | "waste"
  | "wastewater"
  | "land_use"
  | "fire_code"
  | "ceqa"
  | "osha";

type CoverageFamilyStatus = {
  id: string;
  family: CoverageFamily;
  status: "active" | "blocked_missing_fact" | "out_of_scope" | "discovery_candidate";
  reason: string;
  project_facts_considered: string[];
  missing_facts: string[];
};

type RegulatoryAngle = {
  id: string;
  family: CoverageFamily;
  label: string;
  reason: string;
  triggering_facts: string[];
  status: "active" | "blocked_missing_fact" | "out_of_scope" | "discovery_candidate";
};

type ResearchHypothesis = {
  id: string;
  angle_id: string;
  question: string;
  claim_to_test?: string;
  required_facts: string[];
  expected_source_type: "statute" | "regulation" | "agency_guidance" | "permit_portal" | "technical_doc";
  success_criteria: string[];
  dependencies: string[];
};

type ResearchTask = {
  task_id: string;
  hypothesis_id: string;
  assigned_agent: string;
  allowed_tools: string[];
  blocked_tools: string[];
  budget: {
    max_sources: number;
    max_runtime_seconds: number;
    max_model_calls: number;
  };
};

type EvidenceBundle = {
  hypothesis_id: string;
  sources: Array<{
    url: string;
    source_name: string;
    authority_rank: number;
    fetched_at: string;
    content_hash: string;
    effective_date: string | null;
    quote: string;
  }>;
  extracted_claims: Array<{
    field: string;
    value: string;
    source_url: string;
    quote: string;
    confidence: number;
  }>;
  researcher_conclusion: "applies" | "does_not_apply" | "needs_review";
  uncertainties: string[];
};

type VerificationVerdict = {
  hypothesis_id: string;
  verdict: "pass" | "fail" | "needs_review";
  checks: Record<string, { pass: boolean; reason: string }>;
  confidence: number;
  repair_tickets: RepairTicket[];
};

type RepairTicket = {
  ticket_id: string;
  hypothesis_id: string;
  failure_type: "grounding_failed" | "source_failed" | "missing_fact" | "invalid_json" | "conflict";
  failed_check: string;
  observed_problem: string;
  repair_action: string;
  max_attempts_remaining: number;
};

type Determination = {
  requirement: string;
  applies: "yes" | "no" | "needs_review";
  trigger: string;
  project_fact: string;
  citation: string;
  quote: string;
  source_url: string;
  confidence: number;
  verified: boolean;
  review_flag: boolean;
};

type TraceEvent = {
  id: string;
  run_id: string;
  ts: string;
  actor: string;
  phase: string;
  status: "queued" | "running" | "done" | "failed" | "needs_review";
  message: string;
  artifact_id?: string;
};

type ResearchRun = {
  run_id: string;
  status: RunStatus;
  project_facts: Record<string, unknown>;
  jurisdiction_stack: string[];
  coverage_family_statuses: CoverageFamilyStatus[];
  regulatory_angles: RegulatoryAngle[];
  research_graph: ResearchHypothesis[];
  research_tasks: ResearchTask[];
  evidence_bundles: EvidenceBundle[];
  verification_verdicts: VerificationVerdict[];
  repair_tickets: RepairTicket[];
  determinations: Determination[];
  trace_events: TraceEvent[];
  report_markdown: string;
};
```

## Person A: Truth Engine, Backend, Evidence, Verification

Owner: You.

Person A owns whether the system is defensible. If A's side works, the demo can prove that the app is not just a pretty checklist.

### A1. Project Scaffold And Shared Types

- Create the app scaffold if it does not exist.
- Add the shared artifact types.
- Export one shared `ResearchRun` type that Person B can render.
- Add one seeded demo scenario:
  - SoCal manufacturing or Vernon/LA County facility,
  - coating booth or novel process,
  - hazardous liquid around threshold,
  - missing waste quantity,
  - SIC/NAICS present for stormwater.

Acceptance:

- `ResearchRun` can be imported by API code and UI code.
- Sample scenario is a typed object, not loose UI text.

### A2. Seeded Source Fixtures

Create small source fixtures for the 6-8 seeded obligations:

- SCAQMD Rule 201 Permit to Construct/Operate.
- SCAQMD Rule 219 exemption/exclusion check.
- SCAQMD Rule 222 registration check.
- California Industrial General Permit via SIC/NAICS.
- HMBP/CERS hazardous materials thresholds.
- Hazardous waste generator status.
- Construction stormwater if disturbance acreage is present.
- Wastewater pretreatment if relevant.

Each fixture must include:

- source name,
- source URL,
- fetched/as-of date,
- content hash or deterministic fake hash for demo,
- quote,
- extracted threshold/trigger fields.

Acceptance:

- At least 5 official-looking source fixture records exist.
- At least 3 matrix rows can cite quote + URL + hash.
- One fixture intentionally has a weak quote for verifier failure.

### A3. Scope Parser And Jurisdiction Resolver

Implement deterministic scope extraction for the demo.

Output:

- project facts,
- jurisdiction stack,
- missing facts,
- assumptions.

Acceptance:

- Sample input produces structured facts.
- Missing waste quantity is captured as missing.
- Jurisdiction stack includes SCAQMD, California Water Boards, and Local CUPA for the demo.

### A4. Coverage And Planner Core

Implement the planner logic that creates:

- `CoverageFamilyStatus[]`,
- `RegulatoryAngle[]`,
- `ResearchHypothesis[]`,
- `ResearchTask[]`.

Important rule:

- `air`, `stormwater`, `hazmat`, `waste`, `wastewater` are coverage families only.
- They must expand into specific angles and hypotheses.

Minimum demo graph:

- air active:
  - SCAQMD permit-to-construct hypothesis,
  - Rule 219 exemption hypothesis,
  - Rule 222 registration hypothesis.
- hazmat active:
  - HMBP threshold hypothesis.
- waste active or blocked:
  - generator status hypothesis,
  - missing monthly waste quantity blocker.
- stormwater active or out-of-scope:
  - industrial stormwater by SIC/NAICS,
  - construction stormwater by acreage.
- wastewater needs-review or out-of-scope:
  - pretreatment/discharge hypothesis if process discharge is present.

Acceptance:

- Complex demo creates 8-12 research tasks.
- Missing-fact paths stay visible.
- No fixed six-row checklist is used as the execution model.

### A5. Local Research Worker Pool

Implement local async execution first.

Input:

- `ResearchTask[]`.

Output:

- `EvidenceBundle[]`.

Behavior:

- Use fixtures/source cache first.
- Return failed evidence visibly if a fixture/source is missing.
- Use `Promise.allSettled` or equivalent so one failed task does not kill the run.

Acceptance:

- At least 8 tasks run in parallel locally.
- Failed tasks remain in trace/evidence output.
- No silent omission.

### A6. Verifier

Implement checks:

- currency,
- authority,
- grounding,
- predicate math,
- missing facts,
- conflict if applicable.

Must script one intentional failure:

```text
Claim: HMBP applies to all hazardous material storage.
Quote: Businesses must submit information for hazardous materials at or above threshold quantities.
Expected: grounding_failed
```

Acceptance:

- Verifier rejects the overbroad claim.
- Verifier emits `RepairTicket`.
- Unverified rows cannot become verified determinations.

### A7. Repair Loop

Implement one bounded repair cycle.

Repair actions:

- quote-constrained extraction,
- threshold extraction,
- missing fact blocker,
- mark terminal `needs_review`.

Acceptance:

- HMBP repair extracts threshold and compares quantity.
- 60 gallons above 55 gallons becomes verified yes.
- Missing waste quantity remains `needs_review`.
- Max repair attempts stops the loop.

### A8. Synthesis And Report Data

Generate:

- `Determination[]`,
- `report_markdown`,
- `trace_events`,
- candidate `memory_updates` if implemented.

Rules:

- verified evidence can become confident yes/no,
- failed/missing evidence becomes `needs_review`,
- every matrix row needs quote + source URL or review reason.

Acceptance:

- At least 3 matrix rows.
- At least 1 verified row.
- At least 1 needs-review row.
- At least 1 repaired row.

### A9. API Contract

Implement:

```text
POST /api/research/run
```

Input:

```json
{
  "project_description": "string",
  "demo_documents": []
}
```

Output:

- full `ResearchRun`.

Acceptance:

- Person B can build UI using only this endpoint.
- Endpoint works without live external services.

### A10. Eval Harness

Implement minimum golden cases:

- simple construction: 1.2 acres creates construction stormwater yes,
- complex facility: 8-12 tasks, repair, review flags,
- missing facts: `needs_review`, no invented yes/no.

Acceptance:

- Golden eval command prints pass/fail.
- Fail-closed behavior passes.
- Unsupported determinations are not invented.

## Person B: Product Surface, Orchestration UI, Trace, Demo

Owner: Teammate.

Person B owns whether judges understand the swarm. If B's side works, the demo will clearly show the dynamic graph, verification failure, repair, and final matrix.

### B1. App Shell

Build the first screen as the product, not a landing page.

Layout:

- left: project input and sample scenario selector,
- center: research graph and live agent trace,
- right: jurisdiction stack and verification summary,
- bottom: applicability matrix and report/evidence drawer.

Acceptance:

- Opening the app immediately shows the tool.
- No marketing hero page.
- Demo scenario is one click.

### B2. Sample Scenario UX

Add buttons:

- Load SoCal manufacturing demo,
- Load missing-facts demo,
- Load simple construction demo if time.

Acceptance:

- User can run the main demo without typing.
- The exact project description sent to API is visible/editable.

### B3. Research Graph Visualization

Render the graph hierarchy:

```text
Coverage Family
  -> Regulatory Angle
    -> Hypothesis
      -> Source Task
```

States:

- queued,
- running,
- verified,
- failed,
- repaired,
- needs_review,
- out_of_scope,
- blocked_missing_fact.

Acceptance:

- It is visually obvious that families are not final hypotheses.
- Complex demo shows 8-12 task nodes.
- Failed/uncertain nodes remain visible.

### B4. Agent Trace Panel

Render `TraceEvent[]`.

Must show:

- Scope Agent,
- Orchestrator,
- local or Modal worker pool,
- Research Worker,
- Verifier,
- Repair Ticket,
- Synthesis Agent.

Acceptance:

- Dynamic worker count is visible.
- Memory hit/miss or source fixture/cache note is visible if available.
- Modal unavailable/local fallback can be shown as a trace note.

### B5. Jurisdiction And Verification Summary

Right panel should show:

- jurisdiction stack,
- coverage family statuses,
- counts:
  - verified,
  - needs_review,
  - failed,
  - repaired,
  - missing facts.

Acceptance:

- SCAQMD, California Water Boards, and Local CUPA are visible in the main demo.
- Missing facts are visible without opening report.

### B6. Applicability Matrix

Build matrix columns:

- requirement,
- applies,
- trigger,
- project fact,
- citation,
- confidence,
- verified,
- review flag.

Acceptance:

- Verified rows and needs-review rows are visually distinct.
- No row disappears when evidence fails.
- Citation links open evidence drawer.

### B7. Evidence Drawer

For a selected matrix row, show:

- source URL,
- source name,
- quote,
- content hash,
- fetched/as-of date,
- verifier checks,
- repair history if applicable.

Acceptance:

- Judge can see exact quote supporting the row.
- For failed quote, judge can see why verifier rejected it.

### B8. Report View And Export

Render `report_markdown`.

Add:

- copy/export report button,
- copy/export trace JSON button.

Acceptance:

- Final report is readable without opening dev tools.
- Trace export includes graph, tasks, evidence, verifier, and repair events.

### B9. Run States And Failure UX

Implement visible run states:

```text
idle -> queued -> running -> partial -> done
                         -> needs_review
                         -> failed
```

Rules:

- A failed source task stays visible.
- An uncertain row stays visible.
- A missing fact stays visible.
- No spinner-only dead end.

Acceptance:

- If API returns partial/failure data, UI still renders it.
- Every failure is visible in trace or matrix.

### B10. Demo Script And Deck Support

Prepare a short demo script:

1. Load sample scenario.
2. Explain project facts.
3. Show coverage families expanding into angles.
4. Show 8-12 workers running.
5. Pause on verifier failure.
6. Show repair ticket.
7. Show final matrix.
8. Open evidence drawer.
9. Close with fail-closed claim.

Acceptance:

- Demo can be run in under 3 minutes.
- Backup screenshots or short recording exist if time permits.

## Integration Points

Person A gives Person B:

- `ResearchRun` type,
- sample API response JSON,
- `/api/research/run`,
- golden eval output,
- fixture names and source metadata.

Person B gives Person A:

- UI assumptions about `TraceEvent`,
- graph node display requirements,
- matrix row requirements,
- evidence drawer fields,
- any missing API fields needed for demo clarity.

## Daily/Hackathon Merge Order

1. Shared types and sample `ResearchRun` JSON.
2. Person B builds UI from the sample JSON while Person A builds real endpoint.
3. Person A wires endpoint to local planner/worker/verifier.
4. Person B swaps UI from sample JSON to endpoint.
5. Person A adds evals.
6. Person B polishes trace/matrix/evidence drawer.
7. Both run the demo script and fix only demo-blocking bugs.

## Definition Of Done

- Sample scenario runs locally.
- Graph shows coverage families, regulatory angles, hypotheses, and tasks.
- Worker count changes with scenario complexity.
- Verifier catches one bad claim.
- Repair ticket is visible.
- Matrix includes verified, repaired, and needs-review rows.
- Evidence drawer shows quote, URL, hash, as-of date, and checks.
- Golden evals cover complex, simple construction, and missing-fact scenarios.
- Demo works without live external services.
