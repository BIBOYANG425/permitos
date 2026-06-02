# research_aiq

A model-driven **agentic orchestration tier** for PermitPilot's EHS
permit-applicability research, built as a plugin on the
[NVIDIA NeMo Agent Toolkit](https://github.com/NVIDIA/NeMo-Agent-Toolkit) (`nat` / AIQ).

The guiding principle: **the model proposes within the planner's candidates;
mechanism disposes.** An LLM supervisor decides *which* candidate hypotheses are
worth investigating and fans bounded researchers out to gather evidence, but it
never writes the final answer. A deterministic `research_core` backstop (verifier
+ recall floor) produces the determinations and cannot be overridden.

## Architecture

```
orchestrate                       (top-level workflow; threads run_id in Python)
  │
  ├─ 1. plan_candidates           deterministic research_core planner → candidate
  │                               hypotheses + run_id (seeds the run-scoped store)
  │
  ├─ 2. supervisor                tool_calling_agent: prunes within the candidates,
  │      ├─ spawn_researchers      fans bounded researchers out to Modal (evidence)
  │      └─ submit_plan            terminal marker once it has spawned everything
  │
  └─ 3. finalize                  un-bypassable research_core backstop:
                                   verify → repair → synthesize → recall floor
```

`orchestrate` is a single coroutine rather than nat's `sequential_executor` because
`run_id` cannot reliably flow between steps via a `ContextVar`: nat's runner and
langgraph fork/copy the execution context (and the agent's tool nodes) *before* any
step mutates the var, so a `set()` made inside `plan_candidates` is invisible
downstream. `orchestrate` reads `run_id` straight from the planner's JSON output and
binds it as a **process-global** (`set_active_run_id`) — the load-bearing carrier
that survives the context fork — before awaiting the supervisor, then threads it
explicitly into `finalize`.

## Components

| Component | Kind | Role |
|---|---|---|
| `orchestrate` | workflow fn | Top-level; runs plan → supervise → finalize, threads `run_id`, runs the always-on invariants + observability epilogue. |
| `plan_candidates` | fn | Runs the deterministic `research_core` planner; mints `run_id`, seeds the store with scope + candidate hypotheses + per-hypothesis Modal task specs; returns a candidate summary. |
| `supervisor` | `tool_calling_agent` | The LLM tier. Reviews candidates, prunes the clearly-irrelevant, and drives the tools. Never writes determinations. |
| `spawn_researchers` | fn (tool) | Validates requested ids against the candidate set, dedupes, fans the accepted task specs out to bounded researchers on **Modal**, stores the returned evidence bundles, returns distilled conclusions + grounding flags. |
| `submit_plan` | fn (tool) | Terminal marker the supervisor calls once; records its pruning rationale as an audit note. |
| `finalize` | fn | Deterministic backstop. Re-runs `research_core.finalize_run` (verify → repair → synthesize → recall floor) over the gathered evidence. Prunes the plan to the *investigated* hypotheses so the recall floor surfaces any pruned-but-expected program as `needs_review`. |
| `run_store` | module | In-process, run-scoped evidence store (`STORE`) keyed by `run_id`; plus the `run_id` carriers (`set_active_run_id`/`get_active_run_id` process-global, and a best-effort contextvar). |
| `invariants` | module | Always-on, pure, deterministic output checks run on every finished run (`check_invariants`). |
| `observability` | module | Fail-soft run-level Raindrop telemetry (`record_run`). |
| `evaluators` | module | Three custom `nat eval` evaluators (offline, sampled quality scorecard). |

## Setup

Required environment (in `.env.local`, loaded for live runs):

| Var | Purpose |
|---|---|
| `OPENAI_API_KEY` | LLM key for the supervisor. **No key → hard error** (fail-loud). |
| `OPENAI_ORCHESTRATION_MODEL` | Supervisor model (e.g. `gpt-5.2`). `workflow.yml` defaults to `gpt-5.5`. |
| `MODAL_RESEARCH_ENDPOINT` | The Modal `research` worker URL. **Unset/unreachable → hard error.** |
| `MODAL_RESEARCH_TOKEN` | Body-auth token for the Modal worker. |
| `RAINDROP_LOCAL_DEBUGGER` | Local Workshop debugger base URL (defaults to `http://localhost:5899/v1/`). Optional — observability is fail-soft. |

Install (uv venv, both packages editable):

```bash
cd research_aiq
uv venv --python 3.12
uv pip install -e . -e ../research_core
```

> **Env quirk.** `uv run`'s auto-sync sometimes rewrites the editable `.pth` so
> `import research_core` / `research_aiq` break. If a live `nat` command can't find
> the package, re-run the idempotent repair — this is also what makes the plugin's
> entry point discoverable:
> ```bash
> uv pip install -e . -e ../research_core
> ```

## Run

The workflow input is a **SCOPE JSON string** (not natural language) — the same
shape `research_core`'s planner consumes:

```bash
cd research_aiq
PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python \
  .venv/bin/python -m nat.cli.main run \
  --config_file research_aiq/configs/workflow.yml \
  --input '{"facility": {"jurisdiction_stack": ["SCAQMD"], "naics": null, "sic": null}, "project_change": {"description": "Adding a coating booth and storing 60 gallons of a flammable solvent in Los Angeles County.", "equipment": [{"kind": "coating_booth", "description": ""}], "chemicals": [{"name": "solvent", "quantity": 60, "unit": "gal"}], "waste_streams": [], "disturbance_acres": null, "process_discharge": false}, "missing_facts": [], "assumptions": []}'
```

Notes:
- The `PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python` prefix is required for live
  `nat` runs.
- Use the `.venv/bin/python -m nat.cli.main run ...` form (not `uv run nat ...`) to
  avoid the auto-sync env quirk; if entry-point discovery fails, run the
  `uv pip install -e . -e ../research_core` repair first.
- Output is the determinations JSON: `{"run_id", "determinations": [...], "status"}`.

## Eval

The eval-first half of the quality story: an offline, **sampled** scorecard that
runs the full live agentic workflow against a gold dataset.

```bash
cd research_aiq
PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python \
  .venv/bin/python -m nat.cli.main eval \
  --config_file research_aiq/configs/eval_config.yml --reps=N
```

Dataset: `research_aiq/eval/dataset.json` — three realistic SoCal scopes with gold
per-program disposition maps (derivation in `research_aiq/eval/dataset_notes.md`).

Three evaluators (each scores 0..1, averaged across items × reps):

| Evaluator | Measures |
|---|---|
| `determination_accuracy` | Per-program predicted disposition vs gold (fraction matching). |
| `grounding_faithfulness` | Fraction of *verified* determinations whose verbatim quote is actually present in its gathered source (reuses the grounding invariant). |
| `expected_program_recall` | Fraction of `expected_programs_for_scope(scope)` that surface in the determinations (reuses the recall-floor coverage logic). |

`--reps` is the **live-sampling mechanism**: each rep re-runs the full agentic
workflow (live Modal fan-out on `gpt-5.x`), so raising reps quantifies the
*non-determinism* of the agentic tier. Expected scorecard direction: **grounding and
recall sit at ~1.0** (mechanism guarantees them every run), while
**`determination_accuracy` varies** rep-to-rep — that variance is exactly what the
deterministic backstop bounds into a safe `needs_review` rather than a wrong yes/no.

## Fail-loud contract

The `plan → supervise → finalize` **core is fail-loud**: missing `OPENAI_API_KEY`,
an unset/unreachable Modal endpoint, a worker that rejects the token, or an unknown
`run_id` all **raise** and propagate. There is **NO silent deterministic fallback** —
a fabricated "done" would defeat the backstop's guarantees.

The **only** fail-soft part is the post-run epilogue inside `orchestrate`
(observability + the always-on invariants check). It is guarded by a single broad
`except` that never alters the returned determinations and never raises out of the
run. Observability failures (Raindrop down, debugger off) degrade to a single
`WARNING`.

## Two quality layers

1. **Always-on invariants** (`invariants.check_invariants`) — cheap, pure,
   deterministic checks on **every** finished run, asserting the two hard guarantees:
   - grounding: no `verified` determination whose verbatim quote is absent from its
     cited source;
   - recall-floor coverage: every program expected for the scope appears (at least as
     `needs_review`);
   - honest uncertainty: a missing decision-relevant fact is `needs_review`, not a
     confident yes/no.
2. **Offline sampled eval** (`nat eval --reps=N`) — the graded scorecard above, run
   on demand against the gold dataset.

## Raindrop wiring (fail-soft)

- **Run-level interaction (working, validated)** — `observability.record_run` POSTs one
  terminal event per run (status, #determinations, #verified/#needs_review/#investigated,
  invariant violations, model) to `{RAINDROP_LOCAL_DEBUGGER}events/track_partial`,
  replicating the Node SDK's wire shape (there is no Python Raindrop SDK). Verified live
  (2026-06-02): a real gpt-5.2 run's metrics land in the Workshop and the always-on
  invariants report 0 violations.
- **Local span trace** — `workflow.yml` keeps nat's `file` tracer, writing per-step spans
  to `.tmp/research_aiq_traces.jsonl` for local debugging.
- **Per-step OTLP spans → Raindrop (follow-up, not wired)** — nat's OTLP/HTTP exporter
  posts a protobuf body that Raindrop's local debugger rejects with `400 "Failed to decode
  protobuf OTLP body"`, so the OTLP-to-Raindrop exporter was removed (it delivered no spans
  and logged an error every run). Re-add it once Raindrop's OTLP-decode requirements are
  confirmed.

The run-level channel is additive/fail-soft: if the debugger is down, export simply drops —
a run is never blocked or slowed.

## research_core backstop

`finalize` delegates to `research_core.finalize_run`, which:

- requires **verbatim grounding** — the mechanical verifier only passes a claim whose
  quote is present in an authoritative primary source;
- enforces a **recall floor** — it re-derives the expected program set from
  `registry × scope` and surfaces any expected program whose hypothesis was never
  investigated as a `needs_review` determination.

The agent can prune candidates to save budget, but **it can never make an expected
program silently disappear and can never override a verifier verdict.** Pruning a
still-expected program is exactly what trips the recall floor.

## Testing

The reliable test invocation from the package dir:

```bash
cd research_aiq
uv pip install -e . -e ../research_core          # idempotent repair (if needed)
.venv/bin/python -m pytest -q                    # 45 tests
```

The `[tool.pytest.ini_options] pythonpath = [".", "../research_core"]` setting in
`pyproject.toml` makes the suite import both packages **from source** regardless of
the editable `.pth` state, so plain `uv run pytest -q` and
`.venv/bin/python -m pytest -q` both work without an explicit `PYTHONPATH`. (Live
`nat run`/`nat eval` still rely on the package being pip-installed for entry-point
discovery — see the env-quirk note above.)
