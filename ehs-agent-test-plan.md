# EHS Permit-Navigator - Test and Eval Plan

Updated: 2026-05-30
Home repo: https://github.com/a1gmm/Autoresearch-Systems-Hackathon-Antler
Audience: hackathon teammates
Status: implementation-ready QA/eval artifact

## Goal

Prove that the agent swarm can:

1. turn intake into structured scope,
2. create regulatory research hypotheses,
3. retrieve primary sources,
4. ground claims in exact quotes,
5. verify or reject determinations,
6. fail closed when evidence is missing,
7. synthesize a defensible applicability matrix.

## Test Surfaces

| Surface | What To Verify |
|---|---|
| Intake page | Validates facility facts, loads sample scenario, handles missing facts. |
| Scope Agent | Produces `ScopePack` with assumptions and blockers. |
| Orchestrator | Produces coverage floor, hypotheses, tasks, budgets. |
| Research Workers | Spawn dynamically by scope and produce `EvidenceBundle` with sources, quotes, hashes, extracted claims. |
| Verifier | Produces `VerificationVerdict` with pass/fail checks and repair tickets. |
| Repair Loop | Retries bounded failures and terminates as `Needs-review`. |
| Matrix UI | Shows applies/no/needs-review, trigger, citation, confidence, portal, cadence. |
| Evidence Drawer | Shows source URL, as-of date, content hash, quote, and verifier checks. |
| Trace Panel | Shows dynamic worker count, artifact transitions, and failed agent/source states. |
| Eval Scorecard | Shows golden-case pass/fail and summary metrics. |

## Golden Eval Cases

| ID | Scenario | Expected |
|---|---|---|
| EVAL-01 | LA metal finishing facility adds coating booth. | Air hypothesis created; source-backed SCAQMD permit determination; Rule 219 exemption/exclusion considered. |
| EVAL-02 | Manufacturer with regulated SIC/NAICS. | Industrial stormwater hypothesis created; source-backed SMARTS/IGP row. |
| EVAL-03 | Facility stores 60 gallons hazardous liquid. | HMBP row applies; source-backed threshold quote. |
| EVAL-04 | Facility stores 40 gallons hazardous liquid only. | HMBP standard liquid threshold does not apply unless another exception is found. |
| EVAL-05 | Waste generation crosses LQG threshold with exact quantity. | Waste generator-status change flagged with cited threshold. |
| EVAL-06 | Waste generation mentioned but quantity missing. | `Needs-review`; missing-fact blocker recorded. |
| EVAL-07 | Official source fetch fails. | Row remains visible as unable-to-verify; no silent omission. |
| EVAL-08 | Extracted claim quote mismatch. | Grounding check fails; repair ticket emitted. |
| EVAL-09 | Novel process/material outside seed map. | Discovery candidate proposed but not trusted automatically. |
| EVAL-10 | Missing NAICS/SIC. | Stormwater family still appears in coverage floor as blocked or needs-review. |

## Required Metrics

| Metric | Target |
|---|---:|
| Applicability precision on seeded cases | >= 90% |
| Applicability recall on seeded cases | >= 80% |
| Citation grounding for verified rows | >= 95% |
| Fail-closed behavior | 100% |
| Seeded demo latency | < 90 seconds |
| Repair loop termination | 100% stops at max attempts |
| Verified memory write provenance | 100% has source/hash/verdict |

## Eval Philosophy

Use the HowToEval pattern for this hackathon:

1. Start from real traces and logs, not imagined failures.
2. Reproduce important failures locally before patching.
3. Add high-signal golden cases for failure classes that could regress.
4. Keep the suite small enough that the team still trusts failures.
5. Spend build time on trace reading, issue taxonomy, and monitoring, not only on writing test cases.

For the demo, the quote-mismatch repair fixture is our most important eval because it proves fail-closed behavior.

## Artifact-Level Tests

### `ScopePack`

Test:
- full valid intake,
- empty address,
- missing NAICS/SIC,
- unknown jurisdiction,
- chemical inventory with mixed units.

Expected:
- missing facts are explicit,
- assumptions are recorded,
- blocked hypotheses are named.

### `ResearchHypothesis`

Test:
- every coverage-floor family emits a hypothesis, blocker, or out-of-scope reason,
- each hypothesis has triggering facts,
- each hypothesis has acceptance criteria.

Expected:
- no regulatory family disappears silently.

### `ResearchTask`

Test:
- each task has assigned agent,
- each task has allowed tools,
- each task has blocked tools,
- each task has source/runtime/model budget.

Expected:
- researcher cannot write memory or final report.
- worker count scales with scoped hypotheses and source-check subtasks.
- no fixed agent-count assumption appears in the task graph.

### `EvidenceBundle`

Test:
- official HTML source,
- official PDF source,
- source timeout,
- extracted JSON invalid,
- quote missing,
- source hash changes.

Expected:
- source URL, fetched time, hash, and quote are present for successful rows,
- failed source/extraction paths become visible failures.

### `VerificationVerdict`

Test:
- all checks pass,
- authority fails,
- grounding fails,
- predicate math fails,
- missing source date,
- cross-source conflict.

Expected:
- pass/fail reason is explicit,
- failed checks create repair ticket or `Needs-review`,
- unverified claims cannot become verified determinations.

### `RepairTicket`

Test:
- one successful repair,
- repeated grounding failure,
- source fetch failure after retry,
- missing customer fact.

Expected:
- max attempts enforced,
- terminal state is `Needs-review`,
- repair reason appears in trace.

### `GatedMemoryWrite`

Test:
- verified source fact,
- failed hypothesis,
- unverified discovery candidate,
- raw unconditional legal rule.

Expected:
- only provenance-bound verified facts and failed hypotheses are stored,
- unverified discovered law is denied trusted memory.

## UI Flow Tests

### Flow 1: Seeded Scenario

Steps:

1. Click "Load sample facility."
2. Run determination.
3. Watch trace panel.
4. Open matrix row.
5. Open evidence drawer.

Expected:

- run completes under 90 seconds,
- trace panel shows ScopePack, hypotheses, research, verification, and synthesis,
- matrix has verified and/or needs-review rows,
- evidence drawer shows quote, URL, hash, and verifier checks.

### Flow 2: Missing Fact

Steps:

1. Run scenario without NAICS/SIC.
2. Observe stormwater family.

Expected:

- stormwater does not disappear,
- row or coverage-floor item says blocked by missing NAICS/SIC,
- report asks for the missing fact.

### Flow 3: Failed Source

Steps:

1. Force official source fetch failure.
2. Run determination.

Expected:

- trace shows fetch failure,
- row is `Needs-review` or unable-to-verify,
- no silent omission.

### Flow 4: Novel Discovery

Steps:

1. Add a novel process/material outside seed map.
2. Run determination.

Expected:

- Discovery candidate appears,
- candidate is marked untrusted,
- memory writer does not store it as trusted law.

## Edge Cases

- Empty address.
- Address outside seeded jurisdiction.
- Missing NAICS/SIC.
- Conflicting NAICS and business description.
- Chemical quantity just below threshold.
- Chemical quantity exactly at threshold.
- Chemical quantity just above threshold.
- Mixed units in chemical inventory.
- Waste quantity missing.
- PDF parse failure.
- Model returns invalid JSON.
- Extracted quote does not contain claimed trigger.
- Two sources disagree.
- Modal/research task timeout.
- User double-clicks run button.
- User navigates away during run.
- Run partially succeeds.

## Critical Paths

```
ProjectAttributes
  -> ScopePack
  -> ResearchHypotheses
  -> ResearchTasks
  -> EvidenceBundles
  -> VerificationVerdicts
  -> RepairTickets if needed
  -> Determinations
  -> Matrix + Evidence Drawer
  -> GatedMemoryWrites
```

Each arrow needs at least one happy-path test and one failure-path test.

## Demo Acceptance Checklist

- [ ] Seeded scenario completes under 90 seconds.
- [ ] At least 3 matrix rows render.
- [ ] At least 1 row shows verified source quote.
- [ ] At least 1 row shows `Needs-review`.
- [ ] Trace panel shows agent work, not just final output.
- [ ] Evidence drawer shows URL, quote, hash, and checks.
- [ ] Missing fact produces visible blocker.
- [ ] Failed quote grounding produces repair ticket.
- [ ] Memory writer rejects unverified discovery candidate.
- [ ] Eval scorecard is visible in demo or deck.

## Manual Smoke Test Script

1. Start app.
2. Open intake page.
3. Click sample scenario.
4. Click run.
5. Confirm trace panel starts within 3 seconds.
6. Confirm dynamic researcher worker count appears.
7. Confirm verifier task appears.
8. Confirm matrix renders.
9. Open evidence drawer.
10. Confirm source quote and hash exist.
11. Run missing-NAICS scenario.
12. Confirm `Needs-review` blocker.
13. Run quote-mismatch fixture.
14. Confirm repair ticket appears.

## Team Rule

Do not call the demo ready until the system proves fail-closed behavior. A pretty matrix without visible verifier failures is weaker than a smaller matrix that honestly shows what it can and cannot prove.
