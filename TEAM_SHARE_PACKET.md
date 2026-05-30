# EHS Permit-Navigator - Team Share Packet

Updated: 2026-05-30
Home repo: https://github.com/a1gmm/Autoresearch-Systems-Hackathon-Antler

This is the starting point to share with the team.

## What We Are Building

An AI-native EHS research swarm that turns a facility/project change into a defensible regulatory applicability matrix.

The system:

1. narrows customer intake into structured facts,
2. inspects broad EHS coverage families,
3. expands relevant families into regulatory angles and specific research hypotheses,
4. spawns as many scoped specialist research agents as the project needs,
5. retrieves primary regulatory sources,
6. verifies claims against exact source quotes and threshold math,
7. repairs failed research once or twice,
8. synthesizes a report,
9. writes only verified, provenance-bound memories.

## Hackathon Demo Claim

> Given a Southern California manufacturing change, our agent swarm determines applicable EHS obligations, proves each row with current source evidence, and visibly fails closed when evidence is incomplete.

## Start Here

Read these in order:

1. [Hackathon Demo Design](./HACKATHON_DEMO_DESIGN.md)
   - The "whoa" moment, judge story, demo spine, and build focus.
2. [Hacker Resources](./HACKER_RESOURCES.md)
   - Credits and sponsor docs/blogs we should use.
3. [Tool Integration Plan](./TOOL_INTEGRATION_PLAN.md)
   - How Raindrop, Modal, and OpenAI Agents SDK fit together.
4. [Product and Build Plan](./ehs-permit-agent-autoplan-review.md)
   - Product framing, demo scope, build order, team split.
5. [Agent Control Loop Contract](./ehs-agent-control-loop-ceo-review.md)
   - Agent roles, typed artifacts, harness permissions, repair loop, memory rules.
6. [Test and Eval Plan](./ehs-agent-test-plan.md)
   - Golden cases, edge cases, UI flows, acceptance checklist.

## Hacker Resources

- Modal credits: redeem at https://modal.com/credits with the event-provided code. Keep sponsor credit codes in team chat or the event portal, not in the public repo.
- OpenAI credits: claim through the hackathon-provided link. The exact URL was not included in the pasted notes.
- Sponsor docs and blogs are collected in [Hacker Resources](./HACKER_RESOURCES.md).

## Repository Rule

This GitHub repo is the source of truth for plans, demo script, artifact schemas, eval cases, and implementation notes:

https://github.com/a1gmm/Autoresearch-Systems-Hackathon-Antler

Do not commit API keys, sponsor credit codes, customer data, or private source-cache credentials.

## The Demo "Whoa" Moment

The main demo moment is not just "many agents ran." The stronger moment is:

> The verifier rejects a research result because the citation does not actually support the claim. The orchestrator creates a repair ticket. A scoped research worker reruns the failed step. The final matrix shows a corrected verified row or a clear `Needs-review` row.

This proves the system is not just summarizing. It checks itself, repairs scoped failures, and refuses to fake certainty.

## Key Team Decisions

- Applicability determination is the wedge.
- Demo scope is SoCal manufacturing change, not "any project."
- Seed 6-8 high-signal regulatory programs, not 30-40.
- Show the swarm trace in the UI.
- Use typed artifacts between agents.
- Use OpenAI Agents SDK for the code-first agent loop, structured outputs, guardrails, and tracing.
- Use Modal for dynamic research fan-out, source extraction jobs, isolation, timeouts, and scale-down.
- Use Raindrop for local trace debugging, replay, and eval creation; keep it out of the customer-critical runtime path.
- Verifier owns truth.
- Research agents are dynamic workers, not a fixed team size.
- Coverage families are completeness guards, not fixed hypotheses or checklist rows.
- Repair loop is bounded.
- Memory writes are gated.
- Final output is a human-review navigator, not legal advice or autonomous filing.

## Recommended Build Path

Use a deterministic orchestration pipeline with visible dynamic fan-out:

```
Customer Intake
  -> ScopePack
  -> CoverageFamilyStatus[]
  -> RegulatoryAngle[]
  -> ResearchHypothesis[]
  -> ResearchTasks
  -> EvidenceBundles
  -> VerificationVerdicts
  -> RepairTickets
  -> ApplicabilityMatrix
  -> Report
  -> GatedMemoryWrites
```

This is the right hackathon compromise:

- enough swarm behavior to match the theme, with N agents based on scope,
- enough structure to demo reliably,
- enough verification to feel credible.

Planner rule:

```
CoverageFamily
  -> RegulatoryAngle
    -> ResearchHypothesis
      -> ResearchTask
        -> EvidenceBundle
```

The coverage floor should inspect air, stormwater, hazmat, waste, and wastewater, but those families are not the hypotheses. The planner must create fact-specific questions under each active family.

## Who Owns What

### Person A: Backend, Sources, Verification

- Seed 6-8 regulatory programs.
- Build source fetch/extract/hash.
- Build predicate evaluator.
- Build verifier gates.
- Build eval runner.

### Person B: Orchestration, Agents, UI

- Build coverage-family inspection, regulatory-angle expansion, and task graph.
- Build dynamic researcher worker template and repair loop.
- Build trace panel.
- Build applicability matrix and evidence drawer.
- Own demo script and deck flow.

Shared:

- Artifact schemas.
- Coverage family and regulatory angle taxonomy.
- Determination JSON shape.
- Trace event schema.
- Golden eval cases.

## Demo Must Show

- ScopePack created from intake.
- Coverage families inspected, then expanded into fact-specific regulatory angles and hypotheses.
- Dynamic research agents running in parallel, scaled to the project scope.
- One verifier failure with visible repair ticket.
- Source quote, URL, hash, and fetched date.
- Verifier pass/fail checks.
- At least one `Needs-review` row.
- Final applicability matrix.
- Eval scorecard or slide.

## Do Not Build First

- Autonomous filing.
- Full compliance calendar.
- Full permit/SWPPP/HMBP drafting.
- Unlimited recursive spawning with no budget or verification gate.
- Live self-modifying skills.
- Multi-state support.
- Trusted automatic writes from Discovery.

## Final Pitch Frame

> We do not replace the licensed consultant or EHS manager. We give them an autonomous research swarm that finds the law, proves the threshold, shows its work, and fails closed.
