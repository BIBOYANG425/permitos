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

## How We Use OpenAI Agents SDK

The SDK is our code-first agent harness.

We define these as Agents SDK agents:

- `ScopeAgent`: turns intake into `ScopePack`.
- `OrchestratorAgent`: creates `ResearchHypothesis[]` and `ResearchTask[]`.
- `ResearchWorker`: scoped template used inside each Modal job.
- `VerifierAgent`: emits `VerificationVerdict` and `RepairTicket`.
- `SynthesisAgent`: emits the final matrix and report.
- `MemoryWriterAgent`: emits gated memory writes only after verification.

Implementation pattern:

- Prefer manager-style orchestration: the orchestrator keeps control and calls specialists as bounded tools.
- Use handoffs only when a specialist should own a full phase.
- Use structured outputs for every artifact: `ScopePack`, `ResearchTask`, `EvidenceBundle`, `VerificationVerdict`, `RepairTicket`, `Determination`, and `GatedMemoryWrite`.
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
worker_count = scoped research hypotheses + required source-check subtasks
```

Examples:

- Simple tenant improvement: 4-6 Modal research jobs.
- Coating booth plus hazardous liquid demo: 8-12 Modal research jobs.
- Complex EV battery recycling facility: 25+ Modal research jobs.

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
2. OpenAI Agents SDK orchestrator creates hypotheses.
3. Modal launches visible dynamic research workers.
4. Workers return `EvidenceBundle`s.
5. OpenAI Agents SDK verifier rejects one unsupported claim.
6. Orchestrator creates a `RepairTicket`.
7. Modal launches one scoped repair worker.
8. Verifier passes the repaired evidence or marks `Needs-review`.
9. Synthesis produces the applicability matrix.
10. Trace panel shows the whole chain; Raindrop can replay it backstage or as a quick debug reveal.

## Build Order

1. Define Pydantic/Zod schemas for artifacts.
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
