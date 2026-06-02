# Research Core Python Port (Sub-project A) — Design

Date: 2026-06-01
Status: design — decisions resolved in review; pending commit
Build repo: **permitos** worktree (seeded from the antler home repo)
Owner track: NVIDIA NeMo Agent Toolkit (AIQ) path

## Context

We are moving the orchestration + research runtime onto the **NVIDIA NeMo
Agent Toolkit (AIQ / `nvidia-nat`)** on the Python/Modal side, with a
supervisor wrapping the existing `worker_core.run_research_agent` and OpenAI
models supplied via AIQ's `OpenAIModelConfig`. The motivating goal is
**enterprise eval + profiling + observability** over a multi-agent system —
the things AIQ provides natively (`nat evaluate`, profiler, tracing) that the
TypeScript stack does not.

Adopting AIQ is hard to reverse, so we sequence the work **foundation-first**
and prove each layer before the next:

- **A — Python port of the deterministic core (this spec).** Faithful 1:1
  port of the deterministic research pipeline into a new `research_core`
  package, proven to reproduce the existing TypeScript determinations exactly
  against committed goldens. **No AIQ yet.**
- **B — AIQ orchestration tier.** Wrap `run_research_agent` + `research_core`
  entry points as AIQ functions; replace the flat `research_task.map()` with a
  supervisor workflow; OpenAI via `OpenAIModelConfig`; declarative
  `workflow.yml`. The recall floor from A backstops supervisor pruning.
- **C — Eval + profiling harness (the actual goal).** AIQ eval dataset (gold
  determinations) + evaluators (determination accuracy, quote-grounding
  faithfulness, expected-program recall) + profiler (per-researcher
  tokens/latency/cost) + observability export.
- **D — Node thin-client cutover.** Node triggers the Python/AIQ run and
  renders determinations from Supabase; retire the TS live path (keep fixture
  mode).

Dependencies: **A → B → C**, with **D after B**.

This spec covers **A only**. It does not introduce AIQ, does not touch the
live research path, and does not delete any TypeScript.

## Repos & locations

This track builds in the **permitos** worktree (seeded from the antler home
repo; permitos is on `main`, clean tree). All sub-project A artifacts live in
permitos:

- the `research_core/` package at the **permitos worktree root**,
- the goldens exporter `scripts/export-goldens.ts`,
- the committed goldens under `research_core/tests/goldens/`,
- this spec and the forthcoming implementation plan (`docs/superpowers/`).

The TypeScript source ported from is permitos's `src/lib/research/`.

## Goal of sub-project A

Produce a standalone Python package, `research_core`, that is a faithful 1:1
mirror of the TypeScript deterministic pipeline:

> `ScopePack` + fixture evidence → plan → verdicts → repaired bundles →
> determinations + completeness (recall-floor) result

and prove — offline, with no LLM and no network — that the Python pipeline
reproduces the existing TypeScript outputs **exactly** for the three seeded
scenarios. This parity harness is the regression gate for the whole A→D
journey and the seed of the shared eval asset used in C.

## Why a faithful 1:1 port (not an idiomatic rewrite)

The pipeline produces **legally-consequential determinations**. During the
A→D window both implementations exist simultaneously, so drift must localize
to a single module and be caught by a deterministic test. A 1:1 module mirror
+ golden parity gives the tightest safety net and mirrors the project's
existing discipline (the `registrySkillsParity` / `skillsParity` guards that
already prevent the registry and skills library from drifting). An idiomatic
consolidated rewrite was rejected: less code, but weaker drift localization
and harder cross-maintenance — unacceptable for this output class.

Methodology: **differential-harness-first.** Build the golden-trace exporter +
diff harness first, then port each module to satisfy it incrementally as the
TDD oracle.

## Architecture & package layout

A new installable package at the **permitos worktree root**, `research_core/`
(its own `pyproject.toml`, `uv`-managed, Python ≥ 3.11 to match AIQ's
3.11–3.13 support). Fully deterministic; no AIQ dependency in A. The Modal
image's `add_local_python_source("worker_core")` is replaced by importing this
package, and `src/lib/research/modal/worker.py` / `worker_core.py` import from
it (the existing `worker_core.py` folds in over A–D; not deleted in A).

The package is a faithful mirror of the TypeScript deterministic core:

| TS module (`src/lib/research/`)        | → Python peer (`research_core/`) | Notes |
|---|---|---|
| `types.ts`                              | `types.py`        | dataclasses/`TypedDict`s: `ScopePack`, `Determination`, `EvidenceBundle`, `Hypothesis`, `VerificationVerdict`, `RepairTicket`, `CompletenessResult`, `CoverageFamily`, `PlannedRun`, `ResearchRunInput` |
| `scope.ts`                              | `scope.py`        | `parse_scope` (the **one** LLM call) + the pure `scope_pack_from_facts`, `apply_sds_handoff_to_scope`, `project_facts`, `empty_scope` |
| `planner.ts`                            | `planner.py`      | `plan_research` + coverage/angle/hypothesis derivation |
| `programRegistry.ts`                    | `program_registry.py` | `PROGRAM_REGISTRY` (single source of truth), `all_programs`, `programs_for_family`, `program_for_hypothesis`, `source_pointer_for_hypothesis`, `extraction_hint_for_hypothesis`, `skill_id_for_hypothesis`, `registry_hosts`, `ProgramRegistryEntry`, `SourcePointer` |
| `completeness.ts`                       | `completeness.py` | `expected_programs_for_scope`, `verify_determination_set` (the recall floor) |
| `verifier.ts`                           | `verifier.py`     | `verify_evidence`, `repair_evidence` (canned/fixture path only in A), math/threshold branches |
| `synthesis.ts`                          | `synthesis.py`    | `synthesize` → determinations + `report_markdown` |
| `run.ts` (deterministic skeleton only)  | `run.py`          | `plan_run` + `finalize_run` only — **not** the live / Raindrop / LLM-judge / orchestration-briefing parts |
| `confidence.ts`                         | `confidence.py`   | computed confidence — **included in A** (it feeds determination output) |
| `trace.ts`                              | `trace.py`        | structured trace event types (timestamps excluded from parity; see §Risks) |
| `toolCatalog.ts` (subset)               | `tool_catalog.py` | only the subset the deterministic plan references (`toolCatalog.test.ts` uses `seededComplexScope`) |
| `sourceAllowlist.ts` (if referenced)    | `source_allowlist.py` | ported only if `verify_evidence`/`synthesize` reference allowlisted hosts on the fixture path |
| `prompts.ts` (scope-extraction prompt only) | `prompts.py`  | only the scope-extraction prompt; research/orchestration prompts are out of scope for A |
| `fixtures/scenarios.ts`                 | `fixtures/scenarios.py` | the three hand-built `seeded*Scope` packs |
| `fixtures/sources.ts`                   | `fixtures/sources.py` | fixture evidence/sources |

The TypeScript app keeps running unchanged throughout A — there is no cutover
(that is D).

## Two parity regimes + the golden oracle

The pipeline splits cleanly at one seam: only the OpenAI call inside
`scope.ts` (`description → facts`) is non-deterministic. Everything after it is
pure and golden-testable. The three seeded scopes
(`seededComplexScope`, `seededConstructionScope`, `seededMissingFactsScope`)
start from a **hand-built `ScopePack`** (verified: `fixtures/scenarios.ts` has
zero LLM/`fetch` calls), so the deterministic core is fully testable offline.

### Regime 1 — Deterministic core: exact golden parity (the offline gate)

1. A TS exporter `scripts/export-goldens.ts` (run via `tsx`, already a project
   dependency) dumps, for each of the three seeded scopes, the input and the
   structured intermediate + final artifacts:
   `{ scope_pack, fixture_evidence, plan, verdicts, repaired_bundles,
   determinations, status, recall_gaps }`
   as committed JSON under `research_core/tests/goldens/`. The input
   `scope_pack` is the hand-built seeded pack (no extraction step in this
   regime).
2. `research_core/tests/test_parity.py` runs the Python pipeline on the **same
   inputs** (the seeded `ScopePack` + fixture evidence, no LLM) and asserts
   equality against the goldens on the canonicalized structured artifacts —
   float formatting and key/array ordering normalized (see §Risks).

This suite is the **merge gate**. Because goldens are re-exportable, a TS-side
change that legitimately shifts determinations regenerates them and Python
must re-match — the parity-guard discipline, now cross-language.

### Regime 2 — LLM extraction: stable-field eval (opt-in)

`research_core/tests/test_scope_extraction.py` runs the Python OpenAI
extraction on the seeded **descriptions** and asserts only the stable,
post-processed fields — `jurisdiction_stack`, equipment kinds, chemical
names/quantities, `disturbance_acres`, and the derived `missing_facts` —
tolerant on free-text. Requires `OPENAI_API_KEY`; **not** part of the offline
gate.

## Unit-test port

Each deterministic-core TS test gets a pytest peer. The existing
`src/lib/research/modal/worker_core_test.py` folds into the package.

**Port now (deterministic core):** `planner`, `verifier`, `synthesis`,
`scope` (pure portions), `programRegistry`, `completeness`, `run.recallFloor`,
`run.repair`, `run.split`, `toolCatalog`, `confidence`.

**Out of scope for A:** `liveResearchAgent`, `orchestration`, `researchMode`,
`workers.degraded` (live/runtime concerns → B/D); `plannerSdsActivation`,
`sdsActiveFamilies`, `sdsCoverageActivation` (SDS → later sub-project);
`registrySkillsParity` / `skillsParity` (registry↔skills-library guard stays
TS-side while the skills library is not ported — see §Decisions).

## Validation & tooling

- **Gate:** `pytest` offline golden suite (Regime 1). Online extraction eval
  (Regime 2) is opt-in.
- **Packaging:** `pyproject.toml`, `uv`-managed, `ruff` for lint/format,
  Python ≥ 3.11 (matches AIQ).
- **Goldens are re-exportable** via `scripts/export-goldens.ts`, keeping the
  TS source authoritative until D.

## Forward-fit to AIQ (sub-project B) — design constraint on A

A introduces no AIQ, but A's package boundary is shaped so B is a thin wrapper,
not a rewrite. Verified against the toolkit (`github.com/NVIDIA/NeMo-Agent-Toolkit`):

- Custom logic is registered as an AIQ **function** via
  `@register_function(<FunctionConfig>)` from
  `nat.cli.register_workflow`, packaged as a `uv` plugin (see
  `examples/custom_functions/*`).
- OpenAI models are a first-class LLM provider: `OpenAIModelConfig`
  (`nat.llm.openai_llm`, `_type: openai`) declared in the `llms:` block.
- Workflows are declarative `workflow.yml` (`functions:` / `llms:` /
  `workflow:`), run via `nat run` / `nat serve` / `nat evaluate`.

Therefore A must be: **importable with no import-time side effects, pure
functions, explicit dependency injection** (mirroring the existing
`run_research_agent(*, llm_fn, fetch_fn, extract_fn, read_skill_fn)` seam), and
returning plain dataclasses/dicts. Given that, B registers one thin AIQ
function per `research_core` entry point and C's `nat evaluate` / profiler wrap
the same boundaries with zero core changes. **No AIQ types leak into A.**

## Decisions

1. **`report_markdown` parity is structural, not byte-exact** (agreed in
   review). Parity gates on the structured `determinations` / `verdicts` /
   `plan`; the markdown prose is checked structurally (each requirement line
   present). Prose parity is too brittle to gate a merge on.
2. **SDS reviewer is out of scope for A** (agreed in review). `src/lib/sds/`
   (the `reviewSdsInputs` subsystem) is a separate dependency; the three seeded
   scopes carry no SDS documents, so A ports only the
   `apply_sds_handoff_to_scope` **seam** and treats reviews as empty. The full
   SDS port is a later sub-project.
3. **Skills library stays TS-side in A.** Skill *execution* is a live-research
   concern (B), so A ports the registry's `skill_id_for_hypothesis` pointer but
   not the skills library; the `registrySkillsParity` guard remains in TS.
4. **`confidence.py` is included in A** (resolved in review) — it feeds
   determination output and is needed for parity.
5. **Package location: permitos worktree root `research_core/`** (resolved in
   review), kept out of `src/` so it does not entangle Next.js / `tsconfig`.

## Non-goals

- No AIQ / supervisor / `nat` workflow (that is B).
- No live research re-run and no live repair (verifier/repair exercise the
  fixture path only).
- No Node cutover and no deletion of TypeScript (that is D).
- No SDS port, no skills-library port, no orchestration-briefing / LLM-judge
  port.

## Risks & mitigations

- **Float formatting / JSON key & array ordering** across languages →
  explicit normalization in the parity comparator (canonical float repr, sorted
  keys, defined array orderings).
- **Enum / string-literal parity** (`CoverageFamily`, statuses) → shared
  string constants asserted in a dedicated parity test.
- **Trace nondeterminism** (timestamps, ids) → excluded from parity; only
  structural trace shape is asserted, if at all.
- **LLM extraction drift** (Regime 2) → mitigated by stable-field-only
  assertions and kept out of the offline gate.
- **Hidden coupling** (e.g. `confidence`, `sourceAllowlist`, `toolCatalog`
  pulled in transitively) → the differential harness surfaces any missing
  module as a parity failure on first run; port to satisfy it.
