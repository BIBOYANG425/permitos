# Office Hours Design: EHS Research Swarm Hackathon Demo

Updated: 2026-05-30
Home repo: https://github.com/a1gmm/Autoresearch-Systems-Hackathon-Antler
Mode: Builder / Hackathon
Status: team-shareable design doc

## Goal

Win the hackathon demo by making the agent swarm feel real, autonomous, and defensible in under three minutes.

The demo should not try to prove the whole product. It should prove one sharp thing:

> This swarm can research a regulatory question, catch its own unsupported conclusion, repair the research, and produce a defensible applicability matrix with evidence.

## The "Whoa" Moment

The strongest moment is not "many agents ran." That is visually cool, but judges have seen agent fan-out before.

The stronger moment is:

> The verifier rejects a researcher result because the citation does not actually support the claim. The orchestrator creates a repair ticket. A scoped research worker reruns the task. The final matrix shows either a corrected verified row or a clear `Needs-review` row.

Why this wins:

- It shows autonomy: the system does more than retrieve and summarize.
- It shows research discipline: the system checks evidence before synthesis.
- It shows trust: the system refuses to pretend certainty.
- It maps directly to the EHS buyer: compliance users care more about defensibility than flair.

## Demo Spine

```
1. Intake
   "A SoCal manufacturer is adding a coating booth and storing a new chemical."

2. Dynamic fan-out
   Orchestrator inspects coverage families, expands active families into regulatory angles,
   then creates specific hypotheses and source tasks.
   Harness spawns N research workers based on the resulting graph.

3. Evidence gathering
   Workers fetch official sources, extract quotes, and produce EvidenceBundles.

4. Verification failure
   Verifier rejects one row:
   "Grounding failed: quote does not support extracted trigger."

5. Repair
   Orchestrator creates RepairTicket.
   A worker reruns extraction with quote-constrained instructions.

6. Synthesis
   Final matrix appears with:
   - verified rows,
   - one needs-review row,
   - evidence drawer with quote, URL, hash, as-of date.

7. Close
   "We do not replace the EHS manager. We give them a research swarm that finds the law, proves the threshold, shows its work, and fails closed."
```

## Judge Story

Opening line:

> Environmental compliance is full of expensive "did we miss something?" questions. Our system turns one facility change into a swarm of research tasks, then only trusts answers it can prove from primary sources.

Middle line, when fan-out starts:

> The orchestrator is not asking one model for an answer. It is creating hypotheses and spawning scoped research workers based on the project.

Middle line, when verifier fails a row:

> This is the important part. The system found a source, but the quote did not actually prove the claim. So it refuses to trust the result.

Repair line:

> The verifier sends back a repair ticket. The orchestrator reruns the specific failed research step instead of restarting the whole workflow.

Closing line:

> The final output is not a chatbot answer. It is an applicability matrix with citations, source hashes, verifier checks, and human-review flags.

## What To Build For The Demo

### Must Have

- Sample scenario button.
- ScopePack visible or summarized.
- Dynamic worker count visible in trace.
- At least 5 hypotheses generated.
- At least 3 matrix rows.
- At least 1 verified source quote.
- At least 1 intentional verifier failure.
- At least 1 repair ticket.
- At least 1 `Needs-review` row.
- Evidence drawer with URL, quote, hash, fetched date, and verifier checks.

### Nice To Have

- Agent cards animate from `queued` -> `researching` -> `verifying` -> `repaired` -> `done`.
- Eval scorecard with 8-10 golden cases.
- Discovery candidate row for a novel process.
- Cached source replay so the demo works without live network.

### Do Not Spend Time On

- Full compliance calendar.
- Filing portals.
- Multi-state expansion.
- 30-40 seed programs.
- Perfect visual polish.
- Complex recursive sub-agent spawning.

## Demo Data Shape

Use one seeded scenario:

```json
{
  "facility": {
    "address": "Los Angeles County manufacturing facility",
    "jurisdiction_stack": ["SCAQMD", "California Water Boards", "Local CUPA"],
    "naics": "332813",
    "sic": "3471"
  },
  "project_change": {
    "description": "Adding a coating booth and storing a new hazardous liquid",
    "equipment": [
      {"kind": "coating_booth", "description": "new emitting equipment"}
    ],
    "chemicals": [
      {"name": "flammable solvent", "quantity": 60, "unit": "gallons"}
    ],
    "waste_streams": [
      {"description": "spent solvent", "kg_per_month": null}
    ],
    "disturbance_acres": 0
  }
}
```

This scenario creates enough branches:

- air permitting,
- Rule 219 exemption/exclusion,
- industrial stormwater by SIC/NAICS,
- HMBP by hazardous liquid quantity,
- hazardous waste with missing quantity,
- construction stormwater not triggered.

## Intentional Failure To Script

Create a fixture where the researcher extracts an overbroad claim from a source:

```
Claim: HMBP applies to all hazardous material storage.
Quote: Businesses must submit information for hazardous materials at or above threshold quantities...
```

Verifier should fail it:

```
grounding_failed:
The quote mentions threshold quantities, but the extracted claim says all hazardous material storage.
Repair action: extract the threshold and compare to customer quantity.
```

After repair:

```
HMBP applies because stored hazardous liquid quantity is 60 gallons, above the 55 gallon threshold.
```

This is the best "whoa" because it shows the system improving its own answer through verification, not just producing a polished first draft.

## Approaches Considered

### Approach A: Fan-Out Spectacle

Show 25+ workers running across a large project.

Pros:
- Visually exciting.
- Strong fit with swarm theme.
- Makes Modal autoscaling feel relevant.

Cons:
- If the outputs are shallow, it feels like theater.
- Harder to explain in a short demo.
- More moving pieces can break.

### Approach B: Verifier Catches And Repairs

Show a scoped fan-out, one failed verification, a repair ticket, and a corrected or flagged matrix row.

Pros:
- Strongest trust signal.
- Clear research-system differentiation.
- Easy to explain to judges.
- Maps directly to EHS defensibility.

Cons:
- Less visually explosive unless the trace is designed well.
- Requires a controlled failure fixture.

### Approach C: Discovery Finds An Unasked Obligation

Show the system discovering a regulatory family the user did not mention.

Pros:
- Great product value story.
- Shows why this is better than a chatbot.
- Strong fit with applicability determination.

Cons:
- Harder to make defensible live.
- Discovery can look like hallucination if not verified.

## Recommended Approach

Choose Approach B as the main demo moment.

Use Approach A as the visual wrapper: dynamic fan-out in the trace panel.

Use Approach C as a stretch moment: one Discovery candidate marked `Needs-review`, not trusted.

## Screen Plan

### Screen 1: Intake

Left side:
- sample scenario button,
- key facility facts,
- run button.

Right side:
- empty trace timeline.

### Screen 2: Trace Running

Trace rows:

```
ScopePack created
Coverage floor: air, stormwater, hazmat, waste, wastewater
12 research workers spawned
Air worker fetched SCAQMD source
Hazmat worker fetched CUPA/HMBP source
Verifier failed HMBP row: grounding_failed
RepairTicket created
Hazmat repair worker reran threshold extraction
Verifier passed repaired HMBP row
Synthesis complete
```

### Screen 3: Matrix

Rows:

| Requirement | Applies | Trigger | Evidence | Status |
|---|---|---|---|---|
| SCAQMD Permit to Construct | Needs-review or yes | new emitting equipment | source quote | verifier status |
| HMBP/CERS | Yes | 60 gal > threshold | source quote | verified |
| Industrial Stormwater | Needs-review | SIC/NAICS check | source quote | verified or blocked |
| Hazardous Waste Generator Status | Needs-review | missing kg/month | missing fact | needs input |
| Construction Stormwater | No | 0 acres | threshold | verified |

### Screen 4: Evidence Drawer

Show:
- source URL,
- quote,
- hash,
- fetched date,
- verifier checks,
- repair history.

## Success Criteria

The demo works if a judge can repeat these sentences back:

1. "It turns a facility change into multiple research hypotheses."
2. "It spawns a variable number of research agents based on scope."
3. "It checks whether citations actually support claims."
4. "It repairs failed research instead of hiding it."
5. "It produces a matrix a human EHS professional can review."

## Team Assignment

Build the demo around one controlled verifier failure.

Backend/source owner:
- create source fixtures,
- create one intentional grounding failure,
- implement verifier and repair ticket output.

Orchestration/UI owner:
- make dynamic worker count visible,
- render repair ticket in trace,
- render matrix and evidence drawer.

Both:
- rehearse the story until the repair moment lands cleanly in under 20 seconds.

## What I Noticed

- You already had the right loop: intake, hypotheses, research, verification, repair, synthesis, memory.
- The missing piece was not more agents. It was a single memorable moment that proves the agents are trustworthy.
- Your instinct to avoid a fixed agent count is right. The swarm should scale with scope, but the demo still needs a scripted spine.
