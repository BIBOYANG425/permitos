# Tool Integration Plan: Raindrop, Modal, OpenAI Agents SDK

Updated: 2026-05-30
Home repo: https://github.com/a1gmm/Autoresearch-Systems-Hackathon-Antler
Audience: hackathon teammates
Status: team-shareable implementation artifact

## One-Line Answer

OpenAI Agents SDK is the agent control loop, Modal is the elastic execution layer for dynamic research fan-out, and Raindrop is the local trace debugger and replay loop we use to understand and improve failed runs.

## Hackathon Resources To Use

- Modal credits: redeem at https://modal.com/credits with the event-provided code. Keep the actual code outside the repo.
- OpenAI credits: use the event-provided claim link once the team has it.
- Modal autoscaling autoresearch: https://modal.com/blog/autoscaling-autoresearch
- Modal plus OpenAI Agents SDK: https://modal.com/blog/building-with-modal-and-the-openai-agent-sdk
- Raindrop Workshop: https://www.raindrop.ai/docs/workshop/overview/
- HowToEval: https://www.howtoeval.com/

## Ownership Boundaries

| Tool | Role In Our System | What It Owns | What It Does Not Own |
|---|---|---|---|
| OpenAI Agents SDK | Agent brain and orchestration framework | Agent definitions, tools, structured outputs, guardrails, handoffs/manager patterns, run traces | Cloud scaling or long-running worker infrastructure |
| Modal | Compute and worker fabric | Parallel research jobs, source/PDF extraction workers, isolated sandboxes, timeouts, retries, source-cache jobs | Final truth decisions or product UX |
| Raindrop | Debug, observability, replay | Local trace timeline, failed-run inspection, replaying traces after prompt/code changes, turning failures into evals | Customer-facing determination logic or critical runtime dependency |

## Runtime Flow

```text
Next.js Intake UI
  -> OpenAI Agents SDK Scope Agent
  -> OpenAI Agents SDK Orchestrator Agent
       - coverage families are checked for completeness
       - regulatory angles are generated from project facts
       - specific hypotheses are generated under each angle
       - source-check tasks are generated per hypothesis
  -> Modal dynamic research fan-out
       - one Modal job per ResearchTask
       - each job runs a scoped Research Worker
       - source fetch/extract/hash happens inside worker or helper job
  -> OpenAI Agents SDK Verification Agent
       - structured verdict
       - guardrail-style checks
       - repair ticket if evidence fails
  -> Modal repair fan-out for failed subtasks
  -> OpenAI Agents SDK Synthesis Agent
  -> Matrix + Report + GatedMemoryWrite
  -> OpenAI trace / Raindrop trace / in-app trace panel
```

## Research Graph Shape

Do not treat the six EHS domains as the execution model. They are coverage families only.

The execution model is a dynamic research graph:

```text
CoverageFamily
  -> RegulatoryAngle
    -> ResearchHypothesis
      -> ResearchTask
        -> EvidenceBundle
```

Coverage families force the planner to inspect broad regulatory territory. They should not become fixed checklist rows or fixed agents.

Examples:

```text
air
  -> new emitting equipment
    -> Does the coating booth require an SCAQMD Permit to Construct?
    -> Is the equipment exempt under Rule 219?
    -> Does Rule 222 registration apply instead?
    -> Do solvent VOC emissions trigger additional review?

hazmat
  -> hazardous material inventory
    -> Does 60 gallons of flammable solvent exceed HMBP liquid thresholds?
    -> Does lithium battery storage trigger CUPA hazardous material disclosure?
    -> Is fire-code hazardous material inventory review needed?

waste
  -> spent solvent and battery handling
    -> Does spent solvent make the facility a hazardous waste generator?
    -> Is monthly generation enough to classify SQG/LQG?
    -> Are lithium batteries universal waste, hazardous waste, or recyclable material?

stormwater
  -> industrial activity and construction disturbance
    -> Does SIC/NAICS trigger Industrial General Permit coverage?
    -> Does construction disturb 1 or more acres?
    -> Is no-exposure certification plausible or blocked by outdoor operations?

wastewater
  -> process discharge
    -> Does solvent cleaning create industrial wastewater discharge?
    -> Is local pretreatment review needed?
    -> Is zero-discharge claimed, documented, or missing?
```

Recommended artifact additions:

```ts
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
  expected_source_type:
    | "statute"
    | "regulation"
    | "agency_guidance"
    | "permit_portal"
    | "technical_doc";
  success_criteria: string[];
  dependencies: string[];
};
```

This lets a simple project create a small graph while a complex facility creates many more angles and source tasks. That is the demo proof that project complexity determines agent count.

## How We Use OpenAI Agents SDK

The SDK is our code-first agent harness.

We define these as Agents SDK agents:

- `ScopeAgent`: turns intake into `ScopePack`.
- `OrchestratorAgent`: creates `CoverageFamilyStatus[]`, `RegulatoryAngle[]`, `ResearchHypothesis[]`, and `ResearchTask[]`.
- `ResearchWorker`: scoped template used inside each Modal job.
- `VerifierAgent`: emits `VerificationVerdict` and `RepairTicket`.
- `SynthesisAgent`: emits the final matrix and report.
- `MemoryWriterAgent`: emits gated memory writes only after verification.

Implementation pattern:

- Prefer manager-style orchestration: the orchestrator keeps control and calls specialists as bounded tools.
- Use handoffs only when a specialist should own a full phase.
- Use structured outputs for every artifact: `ScopePack`, `CoverageFamilyStatus`, `RegulatoryAngle`, `ResearchTask`, `EvidenceBundle`, `VerificationVerdict`, `RepairTicket`, `Determination`, and `GatedMemoryWrite`.
- Use guardrails around final output, tool calls with side effects, and memory writes.
- Wrap each run in a trace so we can see model calls, tool calls, handoffs, guardrails, and custom artifact events.

Why this matters for the demo:

> The final answer is not one free-form model response. It is a controlled agent run with typed intermediate artifacts and visible verification gates.

## How We Use Modal

Modal is what makes "spawn as many agents as the scope needs" real instead of theatrical.

Each `ResearchTask` becomes a Modal job:

```text
ResearchTask[] -> modal function map/spawn_map -> EvidenceBundle[]
```

Use Modal for:

- dynamic parallel research workers,
- PDF/text extraction,
- source fetch and hash jobs,
- slow or bursty source-check subtasks,
- isolated sandboxes if a worker needs a controlled runtime,
- retries and timeouts on worker jobs,
- scaling down when the research queue is empty.

Fan-out rule:

```text
worker_count = specific research hypotheses + required source-check subtasks
```

Examples:

- Simple tenant improvement: a few coverage families inspected, 4-6 source tasks.
- Coating booth plus hazardous liquid demo: multiple active angles, 8-12 source tasks.
- Complex EV battery recycling facility: many active angles and follow-up source checks, 25+ source tasks.

What not to do:

- Do not run every tiny synchronous step on Modal. Keep intake, orchestration, verification, and synthesis in the app server unless they need isolation or parallel compute.
- Do not let Modal workers decide final truth. They return evidence; the verifier decides whether evidence supports the claim.

## How We Use Raindrop

Raindrop is our agent debugger and replay station.

Use Raindrop during build and demo prep to answer:

- Which agent made the bad leap?
- Which tool call returned weak evidence?
- Did repair actually change the trajectory?
- Can we replay the same failure after a prompt or code patch?
- Can we turn this failure into an eval case?

Demo role:

- Primary judge-facing UI: our own trace panel in the product.
- Optional "builder credibility" moment: show Raindrop Workshop as the local replay/debug view behind the product.
- If time is tight, do not make Raindrop part of the live customer path. Use it to debug the demo and generate evals.

What not to do:

- Do not make a customer result depend on Raindrop being online.
- Do not ask judges to learn a second UI unless it directly helps the story.
- Do not use Raindrop as the source of truth; it observes traces, it does not verify compliance claims.

## Demo Story

The judge should see this sequence:

1. Intake produces a `ScopePack`.
2. OpenAI Agents SDK orchestrator checks coverage families.
3. The orchestrator expands relevant families into regulatory angles and specific hypotheses.
4. Modal launches visible dynamic research workers for the resulting source tasks.
5. Workers return `EvidenceBundle`s.
6. OpenAI Agents SDK verifier rejects one unsupported claim.
7. Orchestrator creates a `RepairTicket`.
8. Modal launches one scoped repair worker.
9. Verifier passes the repaired evidence or marks `Needs-review`.
10. Synthesis produces the applicability matrix.
11. Trace panel shows the whole chain; Raindrop can replay it backstage or as a quick debug reveal.

## Build Order

1. Define Pydantic/Zod schemas for artifacts, including coverage family statuses and regulatory angles.
2. Implement local OpenAI Agents SDK loop with fake/cached sources.
3. Add Modal `run_research_task(task)` for dynamic fan-out.
4. Add source fetch/extract/hash inside the worker.
5. Add verifier and repair-ticket loop.
6. Add in-app trace panel from run events.
7. Instrument with Raindrop for local debugging/replay.
8. Add eval cases from failed traces.
9. Polish the demo script around one verifier failure and repair.

## Sponsor Narrative For Judges

Use the sponsor tooling as part of the product story, not as a pile of logos:

- Modal makes the swarm credible because research workload size is unknown up front; the orchestrator can launch the number of workers the scope requires.
- OpenAI Agents SDK makes the workflow inspectable and controllable through typed agents, structured outputs, guardrails, and traces.
- Raindrop makes the repair loop believable during development because we can replay the exact failed trace after changing the prompt, source extractor, or verifier.
- HowToEval gives us the evaluation loop: read traces, reproduce failures, keep high-signal golden cases, and prune low-value tests.

## Source-Backed Notes

- OpenAI describes the Agents SDK as the code-first path when the application owns orchestration, tool execution, state, and approvals: https://developers.openai.com/api/docs/guides/agents
- OpenAI Agents SDK agents support tools, handoffs, guardrails, and structured outputs: https://openai.github.io/openai-agents-python/agents/
- OpenAI Agents SDK includes built-in tracing for model calls, tool calls, handoffs, guardrails, and custom events: https://openai.github.io/openai-agents-python/tracing/
- Modal supports parallel execution through function maps and background job submission with `spawn_map`: https://modal.com/docs/guide/scale and https://modal.com/docs/guide/batch-processing
- Modal sandboxes are useful for isolated containers that execute untrusted or agent-generated code: https://modal.com/docs/guide/sandboxes
- Raindrop Workshop is a local debugger for AI agents with live traces, replay, and eval workflows: https://www.raindrop.ai/docs/workshop/overview/
- HowToEval recommends reproducing important failures, adding them as golden cases, and keeping eval suites high-signal: https://www.howtoeval.com/

## Final Position

Use all three, but keep them in the right lanes:

> Agents SDK decides and traces. Modal scales the workers. Raindrop helps us debug and replay. The verifier still owns truth.
