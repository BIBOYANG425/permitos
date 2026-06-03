# AIQ-Native Open-Discovery Research Core (Sub-project E) — Design

**Status:** Design (brainstormed 2026-06-03)
**Base:** branched from `main` @ `f146fc8` (D merged via PR #6).
**Depends on:** A (`research_core`), B (`research_aiq`), C (eval/observability), D (Node thin-client) — all merged. Phase 4 (Node integration) depends on D's `orchestrateClient`/endpoint, now on `main`.
**Borrows from:** the parent repo `a1gmm/Autoresearch-Systems-Hackathon-Antler` (`src/research_core/` open-discovery tools, sandbox policy, `SKILL.md` library), reviewed this session + in PR #38.

## Goal

Replace the closed, registry-bounded, pointer-gated research pipeline with a greenfield **AIQ-native open-discovery research core** that behaves like a consulting firm: an **orchestration agent** decomposes the scope into research tasks, **parallel open-discovery researcher sub-agents** — each in its own sandbox — investigate the open web and write findings, and a **senior verifier agent** reviews the work under a three-layer safety stack. AIQ (`nvidia-nat`) owns the entire stack — agents, tools, sandbox, skills, artifacts — so the eval/profiling/observability built in C runs over the open-discovery flow.

## Motivation

The live Cayi eval exposed the closed system's two structural limits: it is **SCAQMD-jurisdiction-locked** and **registry-bounded** (it missed high-pile combustible storage because that program isn't in its fixed registry, with no discovery to find it). The parent repo proved open discovery works — researchers that `web_search` + `browser` + `web_fetch` real primary sources, no curated pointer gate. The thesis for E: **AIQ should own that open-discovery agent too** (not just orchestration), so one framework runs the whole agentic stack *and* the open-discovery researcher lives inside the C eval harness. The product model shifts from "model proposes within candidates; mechanism disposes" to "agentic consultant does the appointed work; a senior agent verifies it" — with mechanical safety floors preserved so a legally-consequential output is never fabricated.

## Decisions (from brainstorming, all confirmed)

1. **No hardened ruleset / no curated source pointers / no fixed planner tree.** The researcher is an LLM agentic agent that works like a human consultant.
2. **Topology = the current flow, agentified.** The orchestration agent evaluates the scope and divides it into tasks/hypotheses; parallel researcher sub-agents research and write artifacts; the orchestration agent then dispatches a senior agent to review and verify.
3. **Three-layer verification.** Senior agent (L1 judgment) + mechanical **grounding floor** (L2) + **recall checklist** (L3).
4. **Per-subagent sandbox.** Every subagent does all its work inside its **own** isolated sandbox (`modal.Sandbox`).
5. **Open to find / tiered authority to cite.** Researchers browse/search the open web freely (safety-only sandbox). Citation **integrity** is un-foolable (the quoted text must verbatim appear in the fetched source). Citation **authority** is a tier ladder with fallbacks: primary (statute/regulation/agency) preferred; if it can't ground at primary, widen down the authority tiers (agency guidance → reputable secondary → …) to produce an answer at the best available tier; the tier is recorded and anything below primary is flagged.
6. **Error model.** Operational failure → **error code** (fail-loud), never a fabricated determination; sandbox/worker death → restart in a fresh sandbox, then error code; ungroundable at any tier / pure data gap → `needs_review` + `information_required`.
7. **Greenfield (approach C).** New `research_agentic/` package; borrow the parent's tool *implementations* re-wrapped as AIQ functions; do **not** reuse `research_aiq`'s deterministic internals (planner / `finalize` / recall-floor / pointer-worker). The recall checklist may reuse the program registry as **reference data** only.

## Architecture

**Where it lives.** New greenfield package `research_agentic/` (sibling to `research_aiq` / `research_core`): an AIQ (`nvidia-nat`) workflow deployed as a Modal endpoint, like the existing orchestrate endpoint. Intake stays in Node (D's `buildScope` → scope); output is the renderer-compatible `ResearchRun`/determinations shape (re-derived here). The Node `orchestrateClient` points at this endpoint (new endpoint or a mode flag) in Phase 4.

**Agent topology — all AIQ `tool_calling_agent`s:**
- **Orchestration agent** — receives the scope; decomposes it into open tasks/hypotheses (LLM-generated, no fixed family tree); spawns one sandboxed researcher per task; collects artifacts; dispatches the senior verifier; runs the bounded repair loop; assembles output. Tools: `spawn_researcher`, `dispatch_verifier`.
- **Researcher sub-agents (parallel, one per task)** — open-discovery consultants, each in its own sandbox. Tool suite (ported from the parent): `web_search`, `web_fetch`, `browser_use` (Playwright), `read_pdf`/`read_docx`/`read_spreadsheet`, `read_skill` (law-code orientation, never citable), `write_artifact`, terminal `submit_finding`.
- **Senior verifier agent** — reviews the assembled findings under the safety stack; emits verdicts + repair tickets; runs in its own sandbox (it re-fetches cited sources to enforce L2).

**Safety stack (the heart of E):**
- **L1 — agentic judgment.** The senior agent reasons: does it apply? is the set complete? is the source authoritative enough for the claim? is the reasoning sound? (the senior-consultant review).
- **L2 — mechanical grounding floor (non-negotiable).** For every decided determination, the cited quote must **verbatim appear** in the re-fetched cited source. This citation-integrity check is mechanical and un-foolable — it kills confabulated citations. **Authority is tiered, not binary** (see decision 5): the determination records the authority tier it grounded at; below-primary tiers are flagged and carry lower confidence + `information_required`.
- **L3 — recall checklist.** The senior agent checks coverage against a maintained known-program list (seeded from the parent's registry/skill set), surfacing missed families (e.g. high-pile) as `needs_review` recall-gap rows. A reference, **not** a constraint on what the researchers investigate.

**Per-subagent sandbox.** Each subagent runs in its own `modal.Sandbox` (isolated container): an ephemeral private workspace (parallel researchers can't see/clobber each other), untrusted fetched content contained per-sandbox (a malicious/injected page can't reach other agents, the orchestrator, secrets, or the host), network egress under the safety policy (SSRF/private-IP blocks, size/time caps), per-agent CPU/mem/wall-clock budgets, torn down after `submit_finding`. The orchestration agent provisions one sandbox per researcher; the senior verifier runs in its own sandbox.

**Sandbox safety policy (open to find, tiered to cite).** Researchers may search/browse the open web to orient; egress is guarded (block private/link-local IPs and SSRF, cap response size + wall-clock, follow-redirect limits). Fetched page content is **untrusted DATA** (injection-quarantined — never interpreted as instructions). A determination's cited source is classified into an authority tier; primary preferred, fallbacks accepted-but-flagged.

**AIQ ownership + eval (the payoff).** The whole graph is AIQ functions/agents, so `nat eval` + the profiler + the scorecard + the model optimizer (all from C) run over the open-discovery flow: grounding faithfulness, recall-vs-checklist, directional accuracy, cost + latency over the sandbox fan-out, senior-agent agreement.

## Components (modules — each focused, testable)

- `research_agentic/functions/orchestrate.py` — top-level AIQ workflow = the orchestration agent (decompose → spawn → collect → dispatch verifier → repair loop → assemble).
- `research_agentic/agents.py` — builders for the 3 roles (orchestration / researcher / senior verifier): instructions + tool sets + model, AIQ-registered.
- `research_agentic/tools/` — researcher tool suite as AIQ functions (ported), each executing **inside the caller's sandbox**: `web_search.py`, `web_fetch.py`, `browser.py`, `read_pdf.py`, `read_docx.py`, `read_spreadsheet.py`, `read_skill.py`, `write_artifact.py`, `submit_finding.py`.
- `research_agentic/sandbox.py` — per-subagent `modal.Sandbox` provisioning + the safety policy (egress guards, authority-tier classifier, injection quarantine).
- `research_agentic/grounding.py` — L2 grounding floor: re-fetch a cited URL in-sandbox, confirm the verbatim quote appears, classify authority tier.
- `research_agentic/recall.py` (+ data) — L3 recall checklist (known-program reference list, seeded from the registry/skill set) + gap detection.
- `research_agentic/skills/` — ported `SKILL.md` law-code library (incl. high-pile, CEQA, VCAPCD) for `read_skill`.
- `research_agentic/store.py` — per-run/per-agent artifact collection (Modal volume + Supabase): findings + captured source snapshots/hashes.
- `research_agentic/output.py` — assemble senior-verified findings into the renderer-compatible `ResearchRun`/determinations.
- `research_agentic/modal_app.py` — deploy the workflow as the endpoint, provision sandboxes, attach secrets.
- `research_agentic/eval/` + evaluators + observability — `nat eval` config + scorecard reused from C; `persist_run`/`record_run` fail-soft.

## Data flow

1. Node intake (`buildScope`) → scope → `POST {token, scope}` to the agentic endpoint.
2. Orchestration agent (sandboxed) decomposes the scope into N open tasks/hypotheses.
3. Per task: spawn a researcher → provision a `modal.Sandbox` → researcher runs its open-discovery loop inside it (`read_skill` → search/browse/fetch primary authority → read docs → reason → `write_artifact` → `submit_finding`), capturing source snapshots. Parallel across tasks.
4. Artifacts (findings + captures) collected to the run store.
5. Orchestration agent dispatches the senior verifier (own sandbox): per finding → L1 judge → L2 grounding floor (re-fetch; quote-appears + authority tier) → L3 recall checklist. Failures → repair tickets.
6. Repair tickets → bounded re-dispatch of the failed researchers, **widening authority tiers + research breadth** to reach a grounded answer (back to step 3).
7. Senior-verified set → `output.py` → `ResearchRun` (grounded → decided with authority tier + confidence; below-primary or ungroundable → `needs_review` + `information_required`; checklist gaps → `needs_review` recall-gap rows).
8. Fail-soft epilogue: `persist_run` (Supabase) + `record_run` (Raindrop). Return → Node renders.

## Error handling (consolidated)

| Situation | Behavior |
|---|---|
| Operational failure (no key, sandbox won't start, tool unreachable, crash) | **error code** — fail-loud, machine-readable; no determination |
| Sandbox/worker dies or times out | **restart in a fresh sandbox** (bounded retries), then **error code** for that task/run |
| Can't ground at primary authority | **widen down authority tiers + keep researching**; ground at best available tier, record tier + `information_required` |
| Groundable at no tier / pure data gap | `needs_review` + `information_required` (what fact/document/data would resolve it) |
| Recall checklist gap | `needs_review` recall-gap row |
| Injection in fetched content | quarantined as untrusted data; contained per-sandbox |
| Observability (`persist_run`/`record_run`) | fail-soft, never blocks the run |

**Concurrency:** isolated sandboxes sidestep the B-era `run_id` contextvar clobbering — each sandbox is its own container; `run_id`/`task_id` are passed in explicitly.

## Output contract

The `ResearchRun`/determination shape stays renderer-compatible, with additions:
- `authority_tier` (or reuse `authority_rank`) on each determination — the tier the determination grounded at.
- `information_required` — a structured detail on `needs_review` (and below-primary) determinations: exactly what fact/document/source would upgrade or resolve it (mirrors the ALG memo's "Next Steps").
- A structured **error-code** path on the endpoint (consistent with D's fail-loud `orchestrateClient`): operational failures return a machine-readable error, not a determination payload.

## Testing & eval

- **Unit (no network, TDD):** `grounding` (quote-appears over captured content + tier classification), `recall` (gap detection), `output` (findings → `ResearchRun`), sandbox policy (SSRF/size/authority classification), injection quarantine.
- **Sandbox/tool integration:** each tool against a stub sandbox; real `modal.Sandbox` validated by live smoke.
- **Live smoke:** one tool-in-sandbox; one researcher end-to-end; one full run.
- **`nat eval`:** run C's 12-scope dataset **+ the Cayi memo as a gold case** → scorecard: grounding faithfulness (every decided determination passes L2), recall-vs-checklist, directional accuracy, cost + latency (profiler over the sandbox fan-out), senior-agent agreement. Even though we chose greenfield (C) over a parallel A/B, this still lets us compare the agentic core against the old deterministic scorecard.
- **Adversarial/safety:** injection page (quarantine holds?), confabulated citation (L2 rejects?), SSRF attempt (sandbox blocks?), authority-fallback (does a primary-less hypothesis ground at a flagged lower tier with `information_required`?).

## Phasing (≈ B+C combined — 4 phases, each its own implementation plan)

1. **Sandbox + tools foundation** — `modal.Sandbox` provisioning + safety policy; port the tool suite as in-sandbox AIQ functions; unit tests + a single-tool-in-sandbox live smoke. No agents yet.
2. **Researcher agent (open discovery)** — the researcher `tool_calling_agent` + sandboxed loop + artifacts + `submit_finding` + source capture; one researcher end-to-end live.
3. **Orchestration + senior verifier + safety stack** — orchestration agent (decompose/spawn/dispatch/repair) + senior verifier + L2 grounding floor + L3 recall checklist + `output.py`; full run end-to-end live.
4. **Eval + endpoint cutover** — `nat eval` + scorecard for the agentic core; deploy the Modal endpoint; point the Node `orchestrateClient` at it (mode or new endpoint); compare scorecard vs the deterministic baseline; observability.

Each phase gets its own writing-plans → subagent-driven-development cycle. Build Phase 1 first.

## Non-goals

- Durable multi-tier memory (Redis/Postgres/vector) beyond run-scoped artifacts (follow-up).
- Moving intake/scope-extraction to Python (stays in Node per D).
- A new UI (the existing determinations renderer is reused; new fields render as additive detail).
- Retiring `research_aiq`'s deterministic pipeline immediately — E is greenfield; the deterministic endpoint stays until E proves out on the eval and Phase 4 cuts over.
- A human-approval UI for discovery-staging (`propose_map_entry`) — the recall checklist surfaces gaps; promoting them is a follow-up.

## Follow-ups

1. Promote recurring recall-checklist gaps (e.g. high-pile, CEQA, VCAPCD) into first-class registry/skill entries.
2. Durable multi-tier memory across runs.
3. Move intake to Python for a fully thin Node client.
4. Discovery-staging with human approval (`propose_map_entry` → reviewed → registry).
