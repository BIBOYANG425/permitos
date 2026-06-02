# AIQ Agentic Orchestration Tier (Sub-project B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a model-driven agentic orchestration tier on the NVIDIA NeMo Agent Toolkit (AIQ): a `tool_calling_agent` supervisor chooses which of the deterministic planner's candidate hypotheses to investigate and spawns researchers on Modal, while `research_core`'s verifier + recall floor remain the un-bypassable post-agent backstop.

**Architecture:** A new `research_aiq/` AIQ plugin package wraps three `@register_function`s — `plan_candidates` (deterministic), `spawn_researchers` (Modal fan-out, accumulates evidence in a run-scoped store), `finalize` (the `research_core` backstop) — plus a `tool_calling_agent` supervisor and a `sequential_executor` workflow. Fail-loud (no silent deterministic fallback). Eval-first: always-on invariant checks + an offline `nat eval --reps=N` live-sampling scorecard. Observability via AIQ OTel tracing + Raindrop.

**Tech Stack:** Python ≥ 3.11, `uv`, `nvidia-nat` (AIQ), `research_core` (sub-project A), `pytest`, `ruff`; OpenAI via `OpenAIModelConfig`; Modal for researcher fan-out; Raindrop (`raindrop.sh`) for trace/eval observability.

---

## Reference: spec
`docs/superpowers/specs/2026-06-01-aiq-agentic-orchestration-tier-design.md`. Read it first.

## Reference: confirmed AIQ patterns (from the toolkit at `/tmp/nemo-agent-toolkit`)

**Custom function** (`examples/custom_functions/plot_charts/.../register.py`):
```python
from nat.builder.builder import Builder
from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig

class MyConfig(FunctionBaseConfig, name="my_fn"):   # name == _type in YAML
    some_field: str = "default"

@register_function(config_type=MyConfig)
async def my_fn(config: MyConfig, builder: Builder):
    # setup runs before yield
    async def _call(input_message: str) -> str:
        return "result"
    yield FunctionInfo.from_fn(_call, description="what this tool does")
```
Plugins are discovered via `pyproject.toml`: `[project.entry-points.'nat.components']  research_aiq = "research_aiq.register"`. Call another function from inside one via `await builder.get_function(name)` then `await fn.acall_invoke(arg)`.

**`tool_calling_agent`** (`examples/agents/tool_calling/configs/config.yml`):
```yaml
workflow:
  _type: tool_calling_agent
  tool_names: [spawn_researchers, submit_plan]
  llm_name: openai_llm
  system_prompt: "..."        # supported (see mixture_of_agents)
  handle_tool_errors: true
  verbose: true
```

**`sequential_executor`** (`examples/control_flow/sequential_executor/`): `workflow: { _type: sequential_executor, tool_list: [a,b,c] }`. **Each step is `async def fn(input: str) -> str`; data flows as a string.** Abort with `SequentialExecutorExit`.

**OpenAI LLM** (`nat/llm/openai_llm.py`): `llms: { openai_llm: { _type: openai, model_name: gpt-4o-mini, temperature: 0.0 } }`; `api_key` falls back to `OPENAI_API_KEY` env.

**Telemetry** (`examples/observability/configs/`): `general.telemetry.tracing.<name>` with `_type: phoenix` (OTLP-HTTP, set `endpoint:`) or `_type: file` (JSONL). **No built-in `raindrop` exporter exists.**

**Eval** (`docs/source/improve-workflows/evaluate.md`): dataset is JSON `[{id, question, answer}, ...]`; `eval.evaluators.<name>` declares evaluators (built-in `ragas`/`trajectory`, or custom registered like functions); run `nat eval --config_file ... --reps=N` (**`--reps` is the sampling mechanism**). `write_atif_workflow_output: true` saves the full trajectory.

**Run/serve:** `nat run --config_file C --input "..."`, `nat serve --config_file C`.

## Reference: the str-passing constraint (critical)
`sequential_executor` passes strings, and the supervisor (`tool_calling_agent`) emits text, so `EvidenceBundle`s cannot flow through the chain. Solution: a **run-scoped evidence store** keyed by `run_id`. `plan_candidates` mints a `run_id`, stores `{scope, candidates}`, and returns a JSON string `{"run_id":..., "candidate_summary":...}`. The supervisor's `spawn_researchers` tool reads `run_id` from a `contextvars` run-context and writes gathered bundles + investigated ids to the store. `finalize` reads `run_id` (threaded through the supervisor's output string) and pulls bundles from the store. Task 2 confirms this wiring on a minimal workflow before the feature tasks build on it.

## File Structure

```
research_aiq/                          # new AIQ plugin package (repo root)
  pyproject.toml                       # deps: nvidia-nat, research_core; entry-point nat.components
  research_aiq/
    __init__.py
    register.py                        # imports the functions so the entry-point registers them
    run_store.py                       # run-scoped evidence store + contextvars run_id
    prompts.py                         # ORCHESTRATION_SYSTEM_PROMPT (ported)
    functions/
      __init__.py
      plan_candidates.py               # @register_function (deterministic; research_core.plan_research)
      spawn_researchers.py             # @register_function (Modal fan-out; store writer)
      submit_plan.py                   # @register_function (terminal marker; records rationale)
      finalize.py                      # @register_function (research_core backstop; store reader)
    invariants.py                      # always-on output checks
    observability.py                   # Raindrop run-level interaction + telemetry helpers
    configs/
      workflow.yml                     # functions + llms + workflow (sequential_executor) + telemetry
      eval_config.yml                  # eval block (dataset + evaluators)
    eval/
      dataset.json                     # 3 gold scopes + labels
      evaluators.py                    # @register_evaluator: accuracy / grounding / recall
  tests/
    test_run_store.py
    test_plan_candidates.py
    test_spawn_researchers.py          # fake Modal client
    test_finalize.py                   # over fixture bundles (reuses research_core)
    test_invariants.py
    test_supervisor_loop.py            # scripted llm + fake spawn (prune/dedupe/budget/fail-loud)
```

Modal researcher fan-out reuses `src/lib/research/modal/worker.py` via `MODAL_RESEARCH_ENDPOINT` (an HTTP call from `spawn_researchers`).

---

## Phase 0 — Scaffold + integration spike

### Task 1: Scaffold `research_aiq`

**Files:** Create `research_aiq/pyproject.toml`, `research_aiq/research_aiq/__init__.py`, `research_aiq/research_aiq/register.py`, `research_aiq/tests/__init__.py`

- [ ] **Step 1: Write `pyproject.toml`**
```toml
[project]
name = "research_aiq"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["nvidia-nat[langchain]>=1.5", "research_core"]

[project.optional-dependencies]
dev = ["pytest>=8", "ruff>=0.6"]

[project.entry-points.'nat.components']
research_aiq = "research_aiq.register"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["research_aiq"]

[tool.uv.sources]
research_core = { path = "../research_core", editable = true }

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 2: Write `__init__.py` and an empty `register.py`**
```python
# research_aiq/research_aiq/__init__.py
"""AIQ agentic orchestration tier for the EHS research pipeline."""
```
```python
# research_aiq/research_aiq/register.py
"""Importing this module registers all research_aiq AIQ components (functions, evaluators)."""
```
Add `research_aiq/tests/__init__.py` (empty) and `research_aiq/.gitignore` with `.venv/`, `__pycache__/`, `uv.lock`.

- [ ] **Step 3: Install + verify**
Run: `cd research_aiq && uv venv --python 3.12 && uv pip install -e ".[dev]" && uv run python -c "import nat, research_core; print('ok')"`
Expected: prints `ok` (AIQ + research_core import). If `nvidia-nat[langchain]` pulls a conflicting dep, capture the error and report.

- [ ] **Step 4: Commit**
```bash
git add research_aiq/pyproject.toml research_aiq/research_aiq/__init__.py research_aiq/research_aiq/register.py research_aiq/tests/__init__.py research_aiq/.gitignore
git commit -m "chore(research_aiq): AIQ plugin package scaffold"
```

### Task 2: AIQ integration spike (confirm the wiring before building features)

**Files:** Create a throwaway `research_aiq/research_aiq/functions/_spike.py` + `research_aiq/configs/_spike.yml`

- [ ] **Step 1: Minimal echo function + a tool_calling_agent inside a sequential_executor**
```python
# research_aiq/research_aiq/functions/_spike.py
from nat.builder.builder import Builder
from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig

class EchoConfig(FunctionBaseConfig, name="spike_echo"):
    prefix: str = "echo:"

@register_function(config_type=EchoConfig)
async def spike_echo(config: EchoConfig, builder: Builder):
    async def _call(input_message: str) -> str:
        return f"{config.prefix} {input_message}"
    yield FunctionInfo.from_fn(_call, description="Echo the input with a prefix.")
```
Import it from `register.py` (`from research_aiq.functions import _spike  # noqa`).

- [ ] **Step 2: Spike config** `research_aiq/configs/_spike.yml`
```yaml
llms:
  openai_llm: { _type: openai, model_name: gpt-4o-mini, temperature: 0.0 }
functions:
  spike_echo: { _type: spike_echo, prefix: "A:" }
  spike_echo2: { _type: spike_echo, prefix: "B:" }
workflow:
  _type: sequential_executor
  tool_list: [spike_echo, spike_echo2]
```

- [ ] **Step 3: Run it (no key needed; no LLM in this config)**
Run: `cd research_aiq && uv run nat run --config_file configs/_spike.yml --input "hi"`
Expected: output shows `B: A: hi` (sequential string chaining works).

- [ ] **Step 4: Spike a `tool_calling_agent` nested as a sequential step.** Add a `spike_agent` workflow variant: a `tool_calling_agent` (tool_names: [spike_echo], llm_name: openai_llm) placed in a `sequential_executor` `tool_list`. With `OPENAI_API_KEY` set, run it and observe whether the agent step accepts the upstream string and emits a string the next step receives.
Run: `cd research_aiq && OPENAI_API_KEY=$OPENAI_API_KEY uv run nat run --config_file configs/_spike_agent.yml --input "say hi"`
Expected: completes; the agent's text output flows to the next step.
**Decision recorded in the commit message:** if a `tool_calling_agent` nests cleanly in `sequential_executor`, the feature workflow uses `sequential_executor [plan_candidates, supervisor, finalize]`. If NOT, the feature workflow's top level is a custom `@register_function` `orchestrate` that calls `plan_candidates → supervisor (builder.get_function) → finalize` and threads structured data in Python (the run-store still carries bundles). Either way the function tasks below are unchanged.

- [ ] **Step 5: Commit the spike findings**
```bash
git add research_aiq/research_aiq/functions/_spike.py research_aiq/research_aiq/register.py research_aiq/configs/_spike.yml research_aiq/configs/_spike_agent.yml
git commit -m "spike(research_aiq): confirm AIQ register/run + agent-in-sequential wiring"
```
(The `_spike*` files are deleted in Task 15.)

---

## Phase 1 — Core functions

### Task 3: Run-scoped evidence store

**Files:** Create `research_aiq/research_aiq/run_store.py`; Test `research_aiq/tests/test_run_store.py`

- [ ] **Step 1: Failing test**
```python
# research_aiq/tests/test_run_store.py
from research_aiq.run_store import RunStore, current_run_id, set_run_id

def test_store_accumulates_and_dedupes_bundles():
    s = RunStore()
    s.init("r1", scope={"run_id": "r1"}, candidates=[{"id": "H-A"}])
    s.add_bundles("r1", [{"hypothesis_id": "H-A", "sources": []}])
    s.add_bundles("r1", [{"hypothesis_id": "H-A", "sources": [{"url": "x"}]}])  # dup id -> last wins
    assert len(s.bundles("r1")) == 1
    assert s.bundles("r1")[0]["sources"] == [{"url": "x"}]
    assert s.investigated_ids("r1") == ["H-A"]

def test_contextvar_run_id_roundtrip():
    token = set_run_id("r2")
    assert current_run_id() == "r2"
    token.var.reset(token) if hasattr(token, "var") else None
```

- [ ] **Step 2: Run → fail.** `cd research_aiq && uv run pytest tests/test_run_store.py -q` → FAIL (no module).

- [ ] **Step 3: Implement**
```python
# research_aiq/research_aiq/run_store.py
"""In-process, run-scoped store. The supervisor runs in one local process, so a
module-level store keyed by run_id is sufficient. spawn_researchers writes
gathered bundles here; finalize reads them. run_id flows to tools via a contextvar."""
from __future__ import annotations
import contextvars

_run_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("research_aiq_run_id", default=None)

def set_run_id(run_id: str):
    return _run_id_var.set(run_id)

def current_run_id() -> str | None:
    return _run_id_var.get()

class RunStore:
    def __init__(self) -> None:
        self._runs: dict[str, dict] = {}

    def init(self, run_id: str, scope: dict, candidates: list[dict]) -> None:
        self._runs[run_id] = {"scope": scope, "candidates": candidates, "bundles": {}}

    def add_bundles(self, run_id: str, bundles: list[dict]) -> None:
        store = self._runs[run_id]["bundles"]
        for b in bundles:
            store[b["hypothesis_id"]] = b   # last write wins (dedupe)

    def bundles(self, run_id: str) -> list[dict]:
        return list(self._runs[run_id]["bundles"].values())

    def investigated_ids(self, run_id: str) -> list[str]:
        return list(self._runs[run_id]["bundles"].keys())

    def scope(self, run_id: str) -> dict:
        return self._runs[run_id]["scope"]

    def candidates(self, run_id: str) -> list[dict]:
        return self._runs[run_id]["candidates"]

STORE = RunStore()   # module singleton
```

- [ ] **Step 4: Run → pass.** `cd research_aiq && uv run pytest tests/test_run_store.py -q` → PASS.
- [ ] **Step 5: Commit.** `git add research_aiq/research_aiq/run_store.py research_aiq/tests/test_run_store.py && git commit -m "feat(research_aiq): run-scoped evidence store + run_id contextvar"`

### Task 4: `plan_candidates` function

**Files:** Create `research_aiq/research_aiq/functions/plan_candidates.py`; Test `research_aiq/tests/test_plan_candidates.py`

- [ ] **Step 1: Failing test** (tests the inner callable directly, not via `nat run`)
```python
# research_aiq/tests/test_plan_candidates.py
import json, asyncio
from research_aiq.functions.plan_candidates import _plan_candidates_impl
from research_aiq.run_store import STORE

def test_plan_candidates_seeds_store_and_returns_summary():
    scope = {"run_id": "seed", "facility": {"jurisdiction_stack": ["SCAQMD"], "naics": None, "sic": None},
             "project_change": {"description": "coating booth", "equipment": [{"kind": "coating_booth", "description": ""}],
                                "chemicals": [{"name": "solvent", "quantity": 60, "unit": "gal"}], "waste_streams": [],
                                "disturbance_acres": None, "process_discharge": False},
             "missing_facts": [], "assumptions": []}
    out = asyncio.run(_plan_candidates_impl(json.dumps(scope)))
    parsed = json.loads(out)
    run_id = parsed["run_id"]
    assert parsed["candidate_summary"]            # non-empty list of candidate lines
    assert len(STORE.candidates(run_id)) > 0      # candidates seeded
    assert STORE.scope(run_id)["facility"]["jurisdiction_stack"] == ["SCAQMD"]
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** (uses `research_core.plan_research`; mints `run_id`; seeds STORE; returns a JSON string)
```python
# research_aiq/research_aiq/functions/plan_candidates.py
import json, uuid
from nat.builder.builder import Builder
from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig
from research_core.planner import plan_research
from research_aiq.run_store import STORE, set_run_id

class PlanCandidatesConfig(FunctionBaseConfig, name="plan_candidates"):
    pass

async def _plan_candidates_impl(scope_json: str) -> str:
    scope = json.loads(scope_json)
    run_id = scope.get("run_id") or f"run-{uuid.uuid4().hex[:8]}"
    scope["run_id"] = run_id
    plan = plan_research(scope, [])
    candidates = plan["research_graph"]
    STORE.init(run_id, scope=scope, candidates=candidates)
    set_run_id(run_id)
    summary = "\n".join(f"- {h['id']} [{h['family']}] {h['question']}" for h in candidates)
    return json.dumps({"run_id": run_id, "candidate_summary": summary})

@register_function(config_type=PlanCandidatesConfig)
async def plan_candidates(config: PlanCandidatesConfig, builder: Builder):
    yield FunctionInfo.from_fn(
        _plan_candidates_impl,
        description="Run the deterministic planner; returns the candidate hypotheses for this scope.")
```
Add `from research_aiq.functions import plan_candidates  # noqa` to `register.py`.

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit.** `git add research_aiq/research_aiq/functions/plan_candidates.py research_aiq/research_aiq/register.py research_aiq/tests/test_plan_candidates.py && git commit -m "feat(research_aiq): plan_candidates function (deterministic planner + store seed)"`

### Task 5: `spawn_researchers` function (Modal fan-out + store writer)

**Files:** Create `research_aiq/research_aiq/functions/spawn_researchers.py`; Test `research_aiq/tests/test_spawn_researchers.py`

- [ ] **Step 1: Failing test** (inject a fake fan-out fn; assert store written + distilled return + fail-loud)
```python
# research_aiq/tests/test_spawn_researchers.py
import json, asyncio
from research_aiq.functions.spawn_researchers import _spawn_impl
from research_aiq.run_store import STORE, set_run_id

def _seed(run_id):
    STORE.init(run_id, scope={"run_id": run_id}, candidates=[{"id": "H-A", "family": "air"}, {"id": "H-B", "family": "hazmat"}])
    set_run_id(run_id)

def test_spawn_accumulates_bundles_and_returns_distilled():
    _seed("s1")
    async def fake_fanout(ids):  # stand-in for the Modal call
        return [{"hypothesis_id": i, "sources": [{"url": "x", "quote": "q"}], "researcher_conclusion": "applies", "extracted_claims": [], "uncertainties": []} for i in ids]
    out = asyncio.run(_spawn_impl(json.dumps({"hypothesis_ids": ["H-A", "H-BOGUS"]}), fanout=fake_fanout, run_id="s1"))
    parsed = json.loads(out)
    assert STORE.investigated_ids("s1") == ["H-A"]          # only valid candidate
    assert parsed["investigated"][0]["hypothesis_id"] == "H-A"
    assert parsed["investigated"][0]["grounded"] is True
    assert "H-BOGUS" in parsed["rejected"]

def test_spawn_fail_loud_on_total_fanout_failure():
    _seed("s2")
    async def boom(ids):
        raise RuntimeError("modal unreachable")
    import pytest
    with pytest.raises(RuntimeError):
        asyncio.run(_spawn_impl(json.dumps({"hypothesis_ids": ["H-A"]}), fanout=boom, run_id="s2"))
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement.** The real fan-out POSTs to `MODAL_RESEARCH_ENDPOINT` (reusing `worker.py`); `_spawn_impl` takes an injectable `fanout` for testing. Validates ids against candidates, dedupes against the store, writes full bundles to the store, returns distilled conclusions. **Fail-loud:** a fan-out exception propagates (no silent fallback).
```python
# research_aiq/research_aiq/functions/spawn_researchers.py
import json, os
from nat.builder.builder import Builder
from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig
from research_aiq.run_store import STORE, current_run_id

class SpawnResearchersConfig(FunctionBaseConfig, name="spawn_researchers"):
    modal_endpoint_env: str = "MODAL_RESEARCH_ENDPOINT"

async def _modal_fanout(ids: list[str]) -> list[dict]:
    import httpx
    endpoint = os.environ.get("MODAL_RESEARCH_ENDPOINT")
    token = os.environ.get("MODAL_RESEARCH_TOKEN")
    if not endpoint:
        raise RuntimeError("spawn_researchers requires MODAL_RESEARCH_ENDPOINT (fail-loud, no fallback)")
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(endpoint, json={"hypothesis_ids": ids},
                                 headers={"Authorization": f"Bearer {token}"} if token else {})
        resp.raise_for_status()
        return resp.json()["bundles"]

async def _spawn_impl(args_json: str, *, fanout=_modal_fanout, run_id: str | None = None) -> str:
    run_id = run_id or current_run_id()
    args = json.loads(args_json)
    requested = [str(x) for x in args.get("hypothesis_ids", [])]
    valid = {c["id"] for c in STORE.candidates(run_id)}
    already = set(STORE.investigated_ids(run_id))
    accepted = [i for i in requested if i in valid and i not in already]
    rejected = [i for i in requested if i not in valid]
    if not accepted:
        return json.dumps({"investigated": [], "rejected": rejected, "note": "no new valid ids"})
    bundles = await fanout(accepted)            # fail-loud: exceptions propagate
    STORE.add_bundles(run_id, bundles)
    investigated = [{"hypothesis_id": b["hypothesis_id"],
                     "conclusion": b.get("researcher_conclusion", "needs_review"),
                     "grounded": len(b.get("sources", [])) > 0} for b in bundles]
    return json.dumps({"investigated": investigated, "rejected": rejected})

@register_function(config_type=SpawnResearchersConfig)
async def spawn_researchers(config: SpawnResearchersConfig, builder: Builder):
    yield FunctionInfo.from_fn(
        _spawn_impl,
        description="Spawn bounded research subagents (on Modal) for the given candidate hypothesis ids. "
                    "Returns each researcher's distilled conclusion + grounding flag. Call once per batch; callable repeatedly.")
```
Add `httpx` to `pyproject.toml` deps. Register in `register.py`.

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit.**

### Task 6: `submit_plan` function (terminal marker)

**Files:** Create `research_aiq/research_aiq/functions/submit_plan.py`; Test `research_aiq/tests/test_submit_plan.py`

- [ ] **Step 1: Failing test** — `_submit_impl(json.dumps({"rationale": "hazmat irrelevant"}))` returns `{"ok": true, "rationale": "hazmat irrelevant"}` and records the rationale in the store for `finalize`/observability.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — a thin function: parse rationale, store it on the run (`STORE` add a `notes` list), return `{"ok": True, "rationale": ...}`. Description: "Finish orchestration once every hypothesis you intend to investigate has been spawned." (Investigated set comes from the store, not this call.)
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit.**

### Task 7: `finalize` function (the `research_core` backstop)

**Files:** Create `research_aiq/research_aiq/functions/finalize.py`; Test `research_aiq/tests/test_finalize.py`

- [ ] **Step 1: Failing test** — seed STORE with a scope + candidates + gathered bundles for a SUBSET (the model pruned one), call `_finalize_impl(json.dumps({"run_id": ...}))`, assert the returned determinations include a recall-floor `needs_review` row for the pruned-but-expected program and `status == "needs_review"` (reuses `research_core` behavior). Mirror `research_core/tests/test_run_recall_floor.py`.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — read `run_id` from args; pull scope + investigated bundles from STORE; rebuild the pruned plan via `research_core.plan_research(scope, [])` filtered to investigated ids (reuse the `prune` idea from the TS plan); call `research_core.finalize_run(run_id, scope, pruned_plan, bundles, [], [])`; return the determinations + status as a JSON string. **Fail-loud:** if STORE has no run for `run_id`, raise (do not fabricate).
```python
# research_aiq/research_aiq/functions/finalize.py  (impl sketch — fill from research_core API)
import json
from research_core.planner import plan_research
from research_core.pipeline import finalize_run
from research_aiq.run_store import STORE

def _prune(plan: dict, investigated_ids: list[str]) -> dict:
    keep = set(investigated_ids)
    return {**plan,
            "research_graph": [h for h in plan["research_graph"] if h["id"] in keep],
            "research_tasks": [t for t in plan["research_tasks"] if t["hypothesis_id"] in keep]}

async def _finalize_impl(args_json: str) -> str:
    run_id = json.loads(args_json)["run_id"]
    scope = STORE.scope(run_id)            # raises KeyError if missing -> fail-loud
    bundles = STORE.bundles(run_id)
    plan = plan_research(scope, [])
    pruned = _prune(plan, STORE.investigated_ids(run_id))
    result = finalize_run(run_id, scope, pruned, bundles, [], [])
    return json.dumps({"run_id": run_id, "determinations": result["determinations"], "status": result["status"]})
```
Register; wrap in `FunctionInfo.from_fn` with description "Verify, repair, synthesize, and apply the recall floor to produce the final determinations."

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit.**

### Task 8: Supervisor prompt + config

**Files:** Create `research_aiq/research_aiq/prompts.py`; Test `research_aiq/tests/test_prompts.py`

- [ ] **Step 1:** Port `ORCHESTRATION_SYSTEM_PROMPT` + the agent task-frame (the `spawn_researchers`/`submit_plan` contract, prune-not-weaken, "when unsure investigate") from `src/lib/research/prompts.ts` into `research_aiq/research_aiq/prompts.py` as `ORCHESTRATION_SYSTEM_PROMPT`. Test asserts it mentions `spawn_researchers` and "recall floor".
- [ ] **Step 2–4:** trivial assertion test → pass.
- [ ] **Step 5: Commit.**

---

## Phase 2 — Workflow + end-to-end

### Task 9: `workflow.yml` + live end-to-end smoke

**Files:** Create `research_aiq/research_aiq/configs/workflow.yml`

- [ ] **Step 1: Write `workflow.yml`** (sequential per Task-2 decision; if the spike chose the custom-orchestrator fallback, wire that instead)
```yaml
general:
  telemetry:
    tracing:
      otel_file: { _type: file, output_path: ./.tmp/research_aiq_traces.jsonl, project: research_aiq }
llms:
  openai_llm:
    _type: openai
    model_name: ${OPENAI_ORCHESTRATION_MODEL:-gpt-5.5}
    temperature: 0.0
functions:
  plan_candidates: { _type: plan_candidates }
  spawn_researchers: { _type: spawn_researchers }
  submit_plan: { _type: submit_plan }
  supervisor:
    _type: tool_calling_agent
    tool_names: [spawn_researchers, submit_plan]
    llm_name: openai_llm
    system_prompt_function: research_aiq_orchestration_prompt   # OR inline system_prompt: "<paste ORCHESTRATION_SYSTEM_PROMPT>"
    handle_tool_errors: false      # fail-loud: tool errors propagate
    verbose: true
  finalize: { _type: finalize }
workflow:
  _type: sequential_executor
  tool_list: [plan_candidates, supervisor, finalize]
```
Note: confirm how `tool_calling_agent` accepts a system prompt (inline `system_prompt:` string vs a prompt function) from the Task-2 spike / `examples/agents`; use the working form. Set `handle_tool_errors: false` so a Modal/researcher failure surfaces (fail-loud).

- [ ] **Step 2: Live end-to-end smoke** (needs `OPENAI_API_KEY` + a reachable `MODAL_RESEARCH_ENDPOINT`, or a local stub endpoint):
Run: `cd research_aiq && OPENAI_API_KEY=$OPENAI_API_KEY uv run nat run --config_file research_aiq/configs/workflow.yml --input '{"project_description":"Adding a coating booth and storing 60 gallons of a flammable solvent in Los Angeles County."}'`
Expected: completes; final output is a JSON determinations payload with a `status`; `./.tmp/research_aiq_traces.jsonl` contains spans for the supervisor turns + tool calls.

- [ ] **Step 3: Fail-loud smoke** — run with `OPENAI_API_KEY` unset → expect a clear error (no determinations produced, no silent deterministic run).
- [ ] **Step 4: Commit.**

---

## Phase 3 — Invariants (always-on)

### Task 10: `invariants.py` + tests

**Files:** Create `research_aiq/research_aiq/invariants.py`; Test `research_aiq/tests/test_invariants.py`

- [ ] **Step 1: Failing tests** — `check_invariants(result, bundles)` over a recorded run dict raises/returns violations when: (a) a `verified: true` determination lacks a verbatim quote present in its source; (b) an expected program is absent from determinations (recall-floor gap not surfaced); (c) a missing-fact case is marked a confident `yes`/`no` instead of `needs_review`. Provide a passing fixture (a good recorded run) and three failing fixtures.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** `check_invariants(result: dict, bundles: list[dict]) -> list[str]` returning a list of violation strings (empty = ok). Reuse `research_core` types. These are pure, deterministic checks on the output.
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit.**

---

## Phase 4 — Observability (Raindrop) + Eval (live + sampling)

### Task 11: Raindrop integration

**Files:** Create `research_aiq/research_aiq/observability.py`

- [ ] **Step 1: Install + inspect Raindrop.** Run: `curl -fsSL https://raindrop.sh/install | bash` then inspect the surface: `raindrop --help 2>&1 | head -40`; check for a Python package (`uv pip show raindrop 2>/dev/null` / `python -c "import raindrop"`); look for an OTLP ingest endpoint / API key env var in its docs/help. **Record what it exposes** (CLI / Python SDK / OTLP endpoint) in the commit message — this picks the wiring.
- [ ] **Step 2: Wire it.** Implement `observability.py` with `record_run(run_id, metrics: dict)` that emits a run-level Raindrop interaction (begin/finish with the run metrics + verifier annotations), mirroring `src/lib/research/run.ts`'s Raindrop usage, using whatever Step-1 found (Python SDK preferred; else shell out to the `raindrop` CLI; else HTTP). If Raindrop ingests OTLP, ALSO add a `tracing` exporter to `workflow.yml` pointing AIQ's OTLP/`phoenix` exporter at Raindrop's endpoint (so every span lands in Raindrop). Fail-soft: observability never blocks a run (wrap in try/except, log on failure).
- [ ] **Step 3: Smoke** — run the workflow (Task 9) and confirm a run appears in Raindrop (or the configured exporter target).
- [ ] **Step 4: Commit** (message records the Raindrop surface + chosen wiring).

### Task 12: Eval dataset + custom evaluators

**Files:** Create `research_aiq/eval/dataset.json`, `research_aiq/eval/evaluators.py`, `research_aiq/research_aiq/configs/eval_config.yml`

- [ ] **Step 1: Dataset** — `eval/dataset.json`: the 3 seeded scopes as `{id, question (the project_description), answer (gold labels: per-program applies/needs_review)}`. Derive the gold per-program labels from `research_core` (the known-correct determinations for each seeded scope).
- [ ] **Step 2: Custom evaluators** — `eval/evaluators.py`: register (via `nat.components` entry-point, like functions) three evaluators: `determination_accuracy` (predicted per-program applies/needs_review vs gold), `grounding_faithfulness` (% of `verified` determinations whose quote is verbatim in source), `expected_program_recall` (every expected program surfaced). Each returns a 0–1 score per item; AIQ aggregates across `--reps`.
- [ ] **Step 3: `eval_config.yml`** — `eval.dataset` (json), `eval.evaluators` (the three above), `eval.general.output.write_atif_workflow_output: true`, referencing the same `workflow` as `workflow.yml`.
- [ ] **Step 4: Run the live sampled eval** (token-costly; offline): `cd research_aiq && OPENAI_API_KEY=$OPENAI_API_KEY uv run nat eval --config_file research_aiq/configs/eval_config.yml --reps=5`
Expected: a scorecard with per-evaluator distributions across 5×3 runs + cost/latency from the profiler. Record a sample scorecard in the commit message.
- [ ] **Step 5: Commit.**

---

## Phase 5 — Finalize

### Task 13: Wire `register.py`, run-level observability into the workflow, fail-loud audit

- [ ] **Step 1:** Ensure `register.py` imports all functions + evaluators so the entry-point registers them. Wire `observability.record_run` into `finalize` (or a thin post-step) so every run is recorded.
- [ ] **Step 2:** Audit fail-loud end-to-end: no `OPENAI_API_KEY` → error; Modal unreachable (point `MODAL_RESEARCH_ENDPOINT` at a closed port) → partial `needs_review` + explicit error event (or hard error if total); verifier/recall-floor always run on gathered evidence. Add a `test_fail_loud.py` asserting the no-key and no-endpoint paths raise rather than silently producing determinations.
- [ ] **Step 3: Commit.**

### Task 14: Delete spike, lint, README, full gate

- [ ] **Step 1:** Delete `functions/_spike.py` + `configs/_spike*.yml`; remove their `register.py` imports.
- [ ] **Step 2:** `cd research_aiq && uv run ruff check . && uv run ruff format .` → clean; re-run `uv run pytest -q`.
- [ ] **Step 3:** Write `research_aiq/README.md`: purpose, how to run (`nat run`), how to eval (`nat eval --reps=N`), the fail-loud contract, the invariants vs eval layers, Raindrop wiring, and that `research_core` is the un-bypassable backstop.
- [ ] **Step 4: Production gate** — `cd research_aiq && uv run pytest -q && uv run ruff check . && echo SUBPROJECT_B_UNIT_GREEN`. (The live eval is offline, not in this gate.)
- [ ] **Step 5: Commit.**

---

## Self-Review (completed by plan author)

**Spec coverage:** supervisor=tool_calling_agent → T8/T9; prune-within-candidates + reactive → T5 (validate ids, dedupe) + the agent loop; spawn_researchers distilled-to-model / full-bundles-to-finalize → T3 (store) + T5 + T7; finalize backstop (verifier+recall floor) → T7; fail-loud → T5 (raise), T9 Step 3, T13 Step 2; researchers on Modal / supervisor local → T5 (`MODAL_RESEARCH_ENDPOINT`) + T9; eval live+sampling → T12 (`nat eval --reps`); invariants always-on → T10; Raindrop + AIQ OTel → T11 + T9 telemetry block; sequential_executor → T2 spike + T9; AIQ-native functions → T1/T4–T7. Non-goals (discovery, Node cutover, profiler/observability dashboards, optimizer) correctly absent.

**Placeholder scan:** Infra/function tasks (1, 3–7, 10) carry complete code. Tasks 8, 11, 12 are specified concretely but include verify-first steps where the external surface is genuinely unknown at plan time (Raindrop's API; the exact `tool_calling_agent` system-prompt field; the eval evaluator-registration entry-point) — each has a concrete inspect/spike step that resolves it before building, which is honest for an integration plan, not a "TODO". Task 7's `finalize` shows the impl sketch keyed to the real `research_core` API (`plan_research`, `finalize_run`).

**Type consistency:** `RunStore`/`STORE`/`set_run_id`/`current_run_id` consistent across T3–T7. `_spawn_impl`, `_plan_candidates_impl`, `_finalize_impl`, `_submit_impl` follow one shape (JSON-string in → JSON-string out, injectable deps for tests). Function `_type` names (`plan_candidates`, `spawn_researchers`, `submit_plan`, `finalize`, `supervisor`) match between the function configs and `workflow.yml` `tool_names`/`tool_list`.

## Follow-ups (NOT in this plan)
1. Discovery (model proposing programs beyond candidates) — needs registry staging.
2. Node thin-client cutover (sub-project D).
3. Full AIQ profiler dashboards + observability backend + optimizer + richer eval dataset (sub-project C).
4. Reactive batching heuristics (spawn a follow-up when a bundle returns `needs_review`).
