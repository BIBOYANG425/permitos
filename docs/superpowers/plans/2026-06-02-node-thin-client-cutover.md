# Node Thin-Client Cutover (Sub-project D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Python `research_aiq` orchestrate workflow the single source of truth for permit research — deploy it as a Modal HTTP endpoint, cut the Node app's research backend over to call it, and delete the duplicate in-Node TypeScript pipeline.

**Architecture:** Two phases. **Phase 1** deploys a Modal endpoint (`orchestrator.py`, sibling to `worker.py`) that runs the nat `orchestrate` workflow on a scope JSON and returns the full `ResearchRun` dict; this requires un-trimming `research_aiq`'s `finalize` so the endpoint returns everything the Node UI renders. **Phase 2** keeps Node's intake/scope-extraction, adds a thin `orchestrateClient` that POSTs `{token, scope}` to the endpoint (fail-loud, no fixture fallback), rewires the research route, and retires the entire in-Node TS pipeline.

**Tech Stack:** Python (nat / `nvidia-nat`, Modal serverless, research_aiq + research_core), TypeScript (Next.js app router, vitest), pnpm.

---

## Background the engineer must know

**The two codebases.**
- `research_aiq/` (outer dir) is a Python package; the importable package is `research_aiq/research_aiq/`. Its sibling is `research_core/`. The deployed Modal researcher worker is `src/lib/research/modal/worker.py` (endpoints `research`, `start_run`) — **it stays**; `research_aiq`'s `spawn_researchers` calls it.
- The Next.js app is at the **repo root** (`app/`, NOT `src/app`). The `@/*` path alias resolves to `./src/` only (see `tsconfig.json`). So `app/` files import shared code via `@/lib/...`, but `app/` itself is outside the alias. Components live in `app/components/`.

**The Python env quirk (for running research_aiq tests locally).** `uv run`'s auto-sync breaks the editable install. Use this exact invocation for every Python test/command in this plan:
```bash
cd /Users/mac/Documents/permitos/research_aiq && PYTHONPATH="$PWD:$PWD/../research_core" .venv/bin/python -m pytest -q
```
`pyproject.toml` pins `pythonpath = [".", "../research_core"]`, so `.venv/bin/python -m pytest` resolves both packages from source. (The live `nat` path needs the package pip-installed for entry-point discovery — that only matters inside the Modal image, handled in Phase 1.)

**The contract that drives the whole cutover.** The Node UI consumes the full `ResearchRun` (type at `src/lib/research/types.ts:212-230`). It needs far more than `{run_id, determinations, status}`:
- `research_graph` — **index-aligned** with `determinations` (`run.determinations[i]` ↔ `run.research_graph[i]`); `src/lib/ui/selectors.ts` relies on this for family grouping and click-to-hypothesis.
- `evidence_bundles`, `verification_verdicts` — read by `app/components/SynthesisDetail.tsx`.
- `coverage_family_statuses`, `regulatory_angles`, `research_tasks`, `repair_tickets`, `memory_updates`, `trace_events`, `report_markdown`, `scope_pack`.

`research_core.finalize_run` (`research_core/research_core/pipeline.py:207-223`) **already returns all of that**. But `research_aiq`'s `finalize` (`research_aiq/research_aiq/functions/finalize.py:87-93`) deliberately trims it to `{run_id, determinations, status}`. Phase 1 Task 1 removes that trim. The only two `ResearchRun` fields `finalize_run` does NOT produce are `project_facts` and `jurisdiction_stack` (both derivable from the scope); the Node client adds them. `sds_reviews` is optional on `ResearchRun` and is produced Node-side (the agentic tier skips SDS) — the route merges it back.

**Determination fields are byte-identical** between TS (`types.ts:169-188`) and Python (`research_core/research_core/types.py`), so no per-field determination adapter is needed.

**run_id flow.** Node mints the run_id (`createRunId()`), puts it on the scope (`scope.run_id`), and `plan_candidates._plan_candidates_impl` uses `scope.get("run_id")` (`plan_candidates.py:31`), so the same run_id threads Node → Python → Supabase → back. Consistent by construction.

**Fail-loud / fail-soft.** The research path is fail-loud: a missing/unreachable endpoint, non-2xx, or missing token surfaces a clear error (no silent fixture fallback). Observability (`persist_run` to Supabase, `record_run` to Raindrop) stays fail-soft and never blocks a run.

**No CI exists** (`.github/workflows/` is absent). The gate is local: `pnpm typecheck` + `pnpm test` + `pnpm build`, and the research_aiq pytest suite.

---

## File Structure

**Phase 1 (Python + Modal):**
- Modify: `research_aiq/research_aiq/functions/finalize.py` — return the full `finalize_run` dict (un-trim).
- Modify: `research_aiq/tests/test_finalize.py` — assert the wider shape.
- Create: `src/lib/research/modal/orchestrator.py` — Modal app + image + token-authed `orchestrate` endpoint wrapping the nat workflow.

**Phase 2 (Node):**
- Create: `src/lib/research/orchestrateClient.ts` — `runResearch(scope) → ResearchRun` (POST, fail-loud, DI-fetch seam).
- Create: `src/lib/research/__tests__/orchestrateClient.test.ts`.
- Create: `src/lib/research/buildScope.ts` — `buildScope(input) → {scope, sds_reviews}` (intake/scope-extraction kept in Node).
- Create: `src/lib/research/__tests__/buildScope.test.ts`.
- Modify: `src/lib/research/scope.ts` — inline `SCOPE_EXTRACTION_SYSTEM` (drop the `./prompts` import).
- Modify: `app/api/research/run/route.ts` — buildScope → orchestrateClient → merge sds_reviews; remove durable branch.
- Delete: the entire in-Node TS pipeline + its tests + the durable runtime + the TS eval scripts (full list in Task 8).
- Modify: `package.json` — remove scripts referencing deleted files.
- Modify: `.env.local` (+ Vercel) — add `MODAL_ORCHESTRATE_ENDPOINT`.

---

# PHASE 1 — Deploy the orchestrate endpoint

## Task 1: Widen `finalize` to return the full ResearchRun dict

**Why:** The endpoint returns whatever `orchestrate` returns, which is whatever `finalize` returns. The UI needs the full run, and `finalize_run` already computes it — `finalize` just trims it. Un-trim it. This is safe for the eval path: every consumer (`evaluators.py`, `eval_report._run_records`, the orchestrate epilogue) reads keys off the parsed dict (`.get("determinations")`, `.get("run_id")`, `.get("status")`), so a superset dict satisfies them all. `test_orchestrate.py` stubs `finalize`, so it is unaffected.

**Files:**
- Modify: `research_aiq/research_aiq/functions/finalize.py:87-93`
- Test: `research_aiq/tests/test_finalize.py`

- [ ] **Step 1: Add a failing test for the wider shape**

In `research_aiq/tests/test_finalize.py`, add this test at the end of the file (it reuses the module's existing `_scope_with`, `_air_201_bundle`, and imports `STORE`, `set_run_id`, `asyncio`, `json`, `_finalize_impl` already at the top):

```python
def test_finalize_returns_full_research_run_shape():
    """finalize must surface the FULL ResearchRun (what the Node UI renders), not the
    trimmed {run_id, determinations, status}. The deployed orchestrate endpoint returns
    finalize's output verbatim, and the renderer needs research_graph (index-aligned
    with determinations), evidence_bundles, verification_verdicts, coverage families,
    trace_events, and report_markdown."""
    from research_core.planner import plan_research

    run_id = "fin-full"
    scope = _scope_with()
    plan = plan_research(scope, [])
    STORE.init(run_id, scope=scope, candidates=plan["research_graph"])
    STORE.add_bundles(run_id, [_air_201_bundle()])
    set_run_id(run_id)

    result = json.loads(asyncio.run(_finalize_impl(json.dumps({"run_id": run_id}))))

    for key in (
        "run_id",
        "status",
        "scope_pack",
        "coverage_family_statuses",
        "regulatory_angles",
        "research_graph",
        "research_tasks",
        "evidence_bundles",
        "verification_verdicts",
        "repair_tickets",
        "memory_updates",
        "determinations",
        "trace_events",
        "report_markdown",
    ):
        assert key in result, f"finalize output missing required ResearchRun key: {key}"
    # the air hypothesis we investigated must be present in research_graph
    assert any(h["id"] == "H-AIR-201" for h in result["research_graph"])
    # report_markdown is a non-empty string the UI report overlay renders
    assert isinstance(result["report_markdown"], str) and result["report_markdown"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /Users/mac/Documents/permitos/research_aiq && PYTHONPATH="$PWD:$PWD/../research_core" .venv/bin/python -m pytest tests/test_finalize.py::test_finalize_returns_full_research_run_shape -q
```
Expected: FAIL — `KeyError`/assertion: `finalize output missing required ResearchRun key: scope_pack` (current output has only run_id/determinations/status).

- [ ] **Step 3: Un-trim `finalize` to return the full dict**

In `research_aiq/research_aiq/functions/finalize.py`, replace the trimmed return (lines 86-93) so the function returns `finalize_run`'s full result. Change:

```python
    result = finalize_run(run_id, scope, pruned, bundles, [], [])
    return json.dumps(
        {
            "run_id": run_id,
            "determinations": result["determinations"],
            "status": result["status"],
        }
    )
```

to:

```python
    result = finalize_run(run_id, scope, pruned, bundles, [], [])
    # Return the FULL ResearchRun-shaped dict, not a trimmed {run_id, determinations,
    # status}: the deployed orchestrate endpoint returns this verbatim and the Node UI
    # renders research_graph (index-aligned with determinations), evidence_bundles,
    # verification_verdicts, coverage families, trace_events, and report_markdown.
    # finalize_run already keys the result by run_id; the eval evaluators + orchestrate
    # epilogue read determinations/run_id/status off this superset, so widening is safe.
    return json.dumps(result)
```

Also update the function's header docstring lines 60-93 region — the `_finalize_impl` summary and the module docstring at lines 1-27 mention "returns the determinations JSON / output is the determinations JSON"; that's still broadly true (determinations are in it). Leave the module docstring; no date header is present in this file, so no header-date bump is required.

- [ ] **Step 4: Run the new test + the whole finalize file**

Run:
```bash
cd /Users/mac/Documents/permitos/research_aiq && PYTHONPATH="$PWD:$PWD/../research_core" .venv/bin/python -m pytest tests/test_finalize.py -q
```
Expected: PASS (all finalize tests, including the new one and the existing recall-floor/fail-loud tests which read only status/determinations/run_id).

- [ ] **Step 5: Run the FULL research_aiq suite (prove the eval path is unaffected)**

Run:
```bash
cd /Users/mac/Documents/permitos/research_aiq && PYTHONPATH="$PWD:$PWD/../research_core" .venv/bin/python -m pytest -q
```
Expected: PASS — all tests green. Pay attention to `test_orchestrate.py`, `test_evaluators.py`, `test_eval_report.py` (these exercise the consumers of the workflow output). If any fails because it asserted an exact 3-key set, update that assertion to read the specific key it needs (`["determinations"]` / `["run_id"]` / `["status"]`) rather than the whole key set — but per the audit none do.

- [ ] **Step 6: Lint + format**

Run:
```bash
cd /Users/mac/Documents/permitos/research_aiq && .venv/bin/ruff format research_aiq/functions/finalize.py tests/test_finalize.py && .venv/bin/ruff check research_aiq/functions/finalize.py tests/test_finalize.py
```
Expected: no diffs reported by check; format leaves files clean.

- [ ] **Step 7: Commit**

```bash
git add research_aiq/research_aiq/functions/finalize.py research_aiq/tests/test_finalize.py
git commit -m "feat(research_aiq): finalize returns full ResearchRun for the orchestrate endpoint"
```

---

## Task 2: Create the Modal orchestrate endpoint

**Why:** A token-authed HTTP service (sibling to `worker.py`) that runs the nat `orchestrate` workflow on a scope and returns the full run. nat is driven programmatically via `nat.runtime.loader.load_workflow` (the same loader `nat run` uses internally).

**Files:**
- Create: `src/lib/research/modal/orchestrator.py`
- Test (local helper unit test): `research_aiq/tests/` is Python-side; the orchestrator lives in the Node tree but is pure Python. We unit-test only the pure auth helper inline via a tiny pytest in the SAME file's package is awkward (it's outside research_aiq). Instead, keep the auth helper trivial and verify it in the live smoke (Task 3). No separate unit-test file is created for `orchestrator.py` (its real test is the live smoke, per the spec).

- [ ] **Step 1: Confirm the worker URL + secrets you will reference**

The endpoint reuses the worker's secrets and needs the deployed worker's `research` URL.
Run:
```bash
modal secret list
```
Expected: `permitpilot-openai`, `permitpilot-research`, `permitpilot-supabase` exist (created during earlier sub-projects). Note the deployed worker `research` endpoint URL — it is the value of `MODAL_RESEARCH_ENDPOINT` in `.env.local`:
```bash
grep '^MODAL_RESEARCH_ENDPOINT=' .env.local
```
Copy that URL; you will paste it into `orchestrator.py`'s image env in Step 2.

- [ ] **Step 2: Write `orchestrator.py`**

Create `src/lib/research/modal/orchestrator.py`. Replace `PASTE_WORKER_RESEARCH_URL_HERE` with the URL from Step 1.

```python
"""Modal orchestrate endpoint — deploys research_aiq's agentic `orchestrate` workflow
as a token-authed HTTP service (sibling to worker.py).

POST {token, scope} -> runs the nat `orchestrate` workflow on the scope JSON ->
returns the FULL ResearchRun dict (finalize's output: determinations, research_graph,
evidence_bundles, verification_verdicts, coverage families, trace_events,
report_markdown, ...) so the Node UI renders unchanged.

The workflow is driven programmatically via nat.runtime.loader.load_workflow (the same
loader the `nat run` CLI uses): it loads workflow.yml, discovers + registers plugins,
builds the workflow, and yields a SessionManager. orchestrate is a shared (non-per-user)
workflow, so session_manager.run(scope_json) -> Runner -> runner.result(to_type=str)
returns the JSON string finalize produced.

Fail-loud: a missing/invalid token -> HTTP 401; a missing OPENAI key / unreachable
worker / pipeline error PROPAGATES -> HTTP 500. Never a fabricated determinations
payload.

Observability (free): the workflow's own epilogue persists a research_runs row to
Supabase (reachable from Modal via the permitpilot-supabase secret) and no-ops Raindrop
(its localhost debugger is unreachable from Modal) — both fail-soft.

Secrets: permitpilot-openai (OPENAI_API_KEY), permitpilot-research (RESEARCH_TOKEN),
permitpilot-supabase (SUPABASE_URL, SUPABASE_SERVICE_KEY).
Image env: OPENAI_ORCHESTRATION_MODEL (gpt-5.2, the cost-optimal), MODAL_RESEARCH_ENDPOINT
(the deployed worker `research` URL the internal fan-out calls).

Deploy from the repo root:  modal deploy src/lib/research/modal/orchestrator.py
"""

import asyncio
import json
import os

import modal

# The deployed worker `research` endpoint that spawn_researchers fans out to.
# (Same value as MODAL_RESEARCH_ENDPOINT in the Node app's .env.local.)
WORKER_RESEARCH_ENDPOINT = "PASTE_WORKER_RESEARCH_URL_HERE"

# Image: nat (+ langchain extra for the tool_calling_agent supervisor) + the two local
# packages, pip-installed editable so research_aiq's nat entry point is discoverable.
# add_local_dir(copy=True) makes the dirs available to the subsequent pip install build
# step. research_core is installed first (research_aiq depends on it by name); both with
# --no-deps because nat + httpx are pip-installed explicitly above and research_core is
# dependency-light. The profiler extra (scipy/sklearn) is eval-only and omitted here.
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "nvidia-nat[langchain]>=1.5",
        "httpx",
        "openai",
        "fastapi[standard]",
        "pyyaml",
    )
    .add_local_dir("research_core", remote_path="/root/research_core", copy=True)
    .add_local_dir("research_aiq", remote_path="/root/research_aiq", copy=True)
    .run_commands(
        "pip install --no-deps -e /root/research_core",
        "pip install --no-deps -e /root/research_aiq",
    )
    .env(
        {
            "OPENAI_ORCHESTRATION_MODEL": "gpt-5.2",
            "MODAL_RESEARCH_ENDPOINT": WORKER_RESEARCH_ENDPOINT,
        }
    )
)

app = modal.App("permitpilot-orchestrate")

# Path inside the image (research_aiq is copied to /root/research_aiq; the inner package
# dir holds configs/workflow.yml).
CONFIG_PATH = "/root/research_aiq/research_aiq/configs/workflow.yml"


def _unauthorized(payload: dict) -> bool:
    """Mirror worker.py's body-token auth: fail closed when the token is unset/mismatched."""
    expected = os.environ.get("RESEARCH_TOKEN", "")
    return (not expected) or payload.get("token") != expected


async def _run_orchestrate(scope_json: str) -> str:
    # Importing research_aiq.register runs every @register_function decorator so the
    # `orchestrate` / `plan_candidates` / `supervisor` / `spawn_researchers` /
    # `submit_plan` / `finalize` components are registered even if entry-point discovery
    # is finicky in the image (belt-and-suspenders alongside the editable install).
    import research_aiq.register  # noqa: F401
    from nat.runtime.loader import load_workflow

    async with load_workflow(CONFIG_PATH) as session_manager:
        async with session_manager.run(scope_json) as runner:
            return await runner.result(to_type=str)


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("permitpilot-openai"),
        modal.Secret.from_name("permitpilot-research"),
        modal.Secret.from_name("permitpilot-supabase"),
    ],
    timeout=600,
)
@modal.fastapi_endpoint(method="POST")
def orchestrate(payload: dict) -> dict:
    from fastapi import HTTPException

    if _unauthorized(payload):
        raise HTTPException(status_code=401, detail="unauthorized")
    scope = payload.get("scope")
    if not isinstance(scope, dict):
        raise HTTPException(status_code=400, detail="missing or invalid scope")

    # spawn_researchers calls the worker with MODAL_RESEARCH_TOKEN; the worker checks
    # RESEARCH_TOKEN. They are the same shared research token, so bridge it here.
    os.environ.setdefault("MODAL_RESEARCH_TOKEN", os.environ.get("RESEARCH_TOKEN", ""))

    # Fail-loud: any pipeline error (no OpenAI key, unreachable worker, finalize error)
    # propagates and Modal returns HTTP 500 — never a fabricated determinations payload.
    result_str = asyncio.run(_run_orchestrate(json.dumps(scope)))
    return json.loads(result_str)


@app.local_entrypoint()
def main():
    print("permitpilot-orchestrate app. Deploy with: modal deploy src/lib/research/modal/orchestrator.py")
```

- [ ] **Step 3: Commit the source (pre-deploy)**

```bash
git add src/lib/research/modal/orchestrator.py
git commit -m "feat(modal): orchestrate endpoint wrapping research_aiq orchestrate workflow"
```

---

## Task 3: Deploy + live smoke the endpoint

**Why:** Phase 1's test is a live smoke (the spec): the endpoint is infra, validated by deploying and calling it. This task is iterative — if the image build or plugin discovery fails, fix the image in `orchestrator.py` and re-deploy.

**Files:** none new (operational).

- [ ] **Step 1: Deploy**

From the repo root:
```bash
modal deploy src/lib/research/modal/orchestrator.py
```
Expected: build succeeds; Modal prints the deployed `orchestrate` endpoint URL (e.g. `https://<account>--permitpilot-orchestrate-orchestrate.modal.run`). Copy it — this is `MODAL_ORCHESTRATE_ENDPOINT` for Phase 2.

If the build fails on the editable install or `import research_aiq.register`, the most likely cause is a missing runtime dependency of `research_core`/`research_aiq` not covered by the explicit `pip_install`. Add the missing package to the `.pip_install(...)` list and re-deploy. (research_core is deterministic/dependency-light; research_aiq needs only nat + httpx, both already listed.)

- [ ] **Step 2: Live smoke — happy path**

Use a real scope. Replace `<URL>` with the deployed endpoint and `<TOKEN>` with the research token (`grep '^MODAL_RESEARCH_TOKEN=' .env.local`):
```bash
curl -sS -X POST "<URL>" \
  -H "content-type: application/json" \
  -d '{"token":"<TOKEN>","scope":{"run_id":"run_smoke_d","facility":{"address":"Fontana, CA","jurisdiction_stack":["SCAQMD","California Water Boards","Local CUPA"],"naics":null,"sic":null},"project_change":{"description":"Install a coating booth using 60 gal of flammable solvent","equipment":[{"kind":"coating_booth","description":"new spray booth"}],"chemicals":[{"name":"solvent","quantity":60,"unit":"gal","hazard":"flammable"}],"waste_streams":[],"disturbance_acres":null,"process_discharge":false},"missing_facts":[],"assumptions":[]}}' \
  | python3 -m json.tool | head -60
```
Expected: a JSON object with `run_id` == `"run_smoke_d"`, a `status` of `"needs_review"` or `"done"`, a non-empty `determinations` array, AND the full-run keys `research_graph`, `evidence_bundles`, `verification_verdicts`, `coverage_family_statuses`, `trace_events`, `report_markdown`. (This run takes up to a few minutes — it drives the real agentic supervisor and Modal fan-out.)

- [ ] **Step 2b: Verify index alignment (load-bearing for the UI)**

The Node selectors rely on `determinations[i]` ↔ `research_graph[i]`. Spot-check that the response's `research_graph` length is consistent with the determinations (the synthesized determinations precede the recall-gap rows; the first `len(research_graph)` determinations correspond to the graph). Save the happy-path JSON to a temp file for reference:
```bash
curl -sS -X POST "<URL>" -H "content-type: application/json" -d '{"token":"<TOKEN>","scope":{...same as above...}}' > /tmp/orchestrate_smoke.json
python3 -c "import json;d=json.load(open('/tmp/orchestrate_smoke.json'));print('determinations',len(d['determinations']),'research_graph',len(d['research_graph']),'report_md_chars',len(d['report_markdown']))"
```
Expected: non-zero counts; `research_graph` length ≤ `determinations` length (recall-gap rows can add extras). If `research_graph` is empty, stop — the supervisor pruned everything; re-check the worker fan-out (Step 4).

- [ ] **Step 3: Live smoke — fail-loud auth**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST "<URL>" -H "content-type: application/json" -d '{"scope":{"run_id":"x","facility":{},"project_change":{}}}'
curl -sS -o /dev/null -w "%{http_code}\n" -X POST "<URL>" -H "content-type: application/json" -d '{"token":"wrong","scope":{"run_id":"x","facility":{},"project_change":{}}}'
```
Expected: both print `401`. No determinations are returned.

- [ ] **Step 4: Confirm a Supabase `research_runs` row landed**

The deployed run's fail-soft epilogue calls `persist_run` → Supabase. Verify the smoke run was recorded (service key from `.env.local`):
```bash
SUPABASE_URL=$(grep '^SUPABASE_URL=' .env.local | cut -d= -f2-) ; SUPABASE_SERVICE_KEY=$(grep '^SUPABASE_SERVICE_KEY=' .env.local | cut -d= -f2-) ; curl -sS "$SUPABASE_URL/rest/v1/research_runs?run_id=eq.run_smoke_d&select=run_id,status,n_determinations,model" -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```
Expected: a JSON array with one row: `run_id` = `run_smoke_d`, a `status`, `n_determinations` > 0, `model` = `gpt-5.2`. (If empty: the Supabase secret may be missing on the orchestrator function — confirm `permitpilot-supabase` is attached and re-deploy. This is fail-soft, so the run still returned determinations.)

- [ ] **Step 5: Record the endpoint URL for Phase 2**

Note the `MODAL_ORCHESTRATE_ENDPOINT` URL from Step 1. It is consumed by `orchestrateClient.ts` and added to `.env.local` in Task 9. No commit in this task (operational only).

---

# PHASE 2 — Node thin client + retire the TS pipeline

## Task 4: The `orchestrateClient` thin client

**Why:** One fail-loud transport: POST `{token, scope}` to the endpoint, return the parsed full `ResearchRun`, adding the two TS-only fields (`project_facts`, `jurisdiction_stack`) derivable from the scope. Mirrors `modal/researchPool.ts`'s DI-fetch seam + AbortController so it is unit-testable without network.

**Files:**
- Create: `src/lib/research/orchestrateClient.ts`
- Test: `src/lib/research/__tests__/orchestrateClient.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/research/__tests__/orchestrateClient.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { __setFetchForTests, runResearch } from "../orchestrateClient";
import type { ResearchRun, ScopePack } from "../types";

const scope: ScopePack = {
  run_id: "run_test",
  facility: { address: "Fontana, CA", jurisdiction_stack: ["SCAQMD"], naics: null, sic: null },
  project_change: {
    description: "coating booth",
    equipment: [],
    chemicals: [],
    waste_streams: [],
    disturbance_acres: null,
    process_discharge: null,
  },
  missing_facts: [],
  assumptions: [],
};

function endpointRun(): Partial<ResearchRun> {
  return {
    run_id: "run_test",
    status: "done",
    scope_pack: scope,
    coverage_family_statuses: [],
    regulatory_angles: [],
    research_graph: [],
    research_tasks: [],
    evidence_bundles: [],
    verification_verdicts: [],
    repair_tickets: [],
    memory_updates: [],
    determinations: [],
    trace_events: [],
    report_markdown: "# report",
  };
}

afterEach(() => {
  __setFetchForTests(null);
  delete process.env.MODAL_ORCHESTRATE_ENDPOINT;
  delete process.env.MODAL_RESEARCH_TOKEN;
});

describe("orchestrateClient.runResearch", () => {
  it("POSTs {token, scope} and returns the run with project_facts + jurisdiction_stack added", async () => {
    process.env.MODAL_ORCHESTRATE_ENDPOINT = "https://endpoint.test";
    process.env.MODAL_RESEARCH_TOKEN = "secret-token";
    const fake = vi.fn(
      async () =>
        ({ ok: true, status: 200, json: async () => endpointRun() }) as unknown as Response,
    );
    __setFetchForTests(fake as unknown as typeof fetch);

    const run = await runResearch(scope);

    expect(run.determinations).toEqual([]);
    expect(run.report_markdown).toBe("# report");
    // adapter-added fields (TS-only; not produced by finalize_run)
    expect(run.jurisdiction_stack).toEqual(["SCAQMD"]);
    expect(run.project_facts).toMatchObject({ address: "Fontana, CA" });
    // request shape
    const [url, init] = fake.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://endpoint.test");
    expect(JSON.parse(String(init.body))).toEqual({ token: "secret-token", scope });
  });

  it("throws fail-loud on a non-2xx response", async () => {
    process.env.MODAL_ORCHESTRATE_ENDPOINT = "https://endpoint.test";
    process.env.MODAL_RESEARCH_TOKEN = "secret-token";
    __setFetchForTests(
      (async () => ({ ok: false, status: 502, json: async () => ({}) }) as unknown as Response) as typeof fetch,
    );
    await expect(runResearch(scope)).rejects.toThrow(/HTTP 502/);
  });

  it("throws fail-loud when the endpoint is unreachable", async () => {
    process.env.MODAL_ORCHESTRATE_ENDPOINT = "https://endpoint.test";
    process.env.MODAL_RESEARCH_TOKEN = "secret-token";
    __setFetchForTests(
      (async () => {
        throw new Error("network down");
      }) as typeof fetch,
    );
    await expect(runResearch(scope)).rejects.toThrow(/network down/);
  });

  it("throws fail-loud when env is not configured", async () => {
    await expect(runResearch(scope)).rejects.toThrow(/not configured/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm vitest run src/lib/research/__tests__/orchestrateClient.test.ts
```
Expected: FAIL — cannot import `../orchestrateClient` (module does not exist yet).

- [ ] **Step 3: Write `orchestrateClient.ts`**

Create `src/lib/research/orchestrateClient.ts`:

```ts
import type { ResearchRun, ScopePack } from "./types";
import { projectFacts } from "./scope";

// DI seam: tests inject a fake fetch (vi.mock of global fetch is unreliable under this
// vitest config). Mirrors __setFetchForTests in modal/researchPool.ts.
export type FetchFn = typeof fetch;
let fetchImpl: FetchFn | null = null;
export function __setFetchForTests(fn: FetchFn | null): void {
  fetchImpl = fn;
}
function getFetch(): FetchFn {
  return fetchImpl ?? fetch;
}

// Matched to the orchestrate Modal function's own 600s timeout: a full agentic run can
// take minutes (plan -> supervisor -> Modal fan-out -> finalize).
const REQUEST_TIMEOUT_MS = 600_000;

// The single research path: POST {token, scope} to the deployed orchestrate endpoint and
// return the full ResearchRun. FAIL-LOUD — an unconfigured/unreachable endpoint, a
// non-2xx response, or an error body throws a clear "research unavailable" error (no
// silent fixture fallback). finalize_run produces every ResearchRun field except the two
// TS-only ones (project_facts, jurisdiction_stack), which are derived from the scope here.
export async function runResearch(scope: ScopePack): Promise<ResearchRun> {
  const endpoint = process.env.MODAL_ORCHESTRATE_ENDPOINT;
  const token = process.env.MODAL_RESEARCH_TOKEN;
  if (!endpoint || !token) {
    throw new Error(
      "Research unavailable: MODAL_ORCHESTRATE_ENDPOINT / MODAL_RESEARCH_TOKEN not configured",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await getFetch()(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, scope }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`Research unavailable: orchestrate endpoint HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as Partial<ResearchRun> & { error?: string };
    if (data.error) {
      throw new Error(`Research unavailable: orchestrate endpoint error: ${data.error}`);
    }
    return {
      ...(data as ResearchRun),
      project_facts: projectFacts(scope),
      jurisdiction_stack: scope.facility.jurisdiction_stack,
    };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm vitest run src/lib/research/__tests__/orchestrateClient.test.ts
```
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/orchestrateClient.ts src/lib/research/__tests__/orchestrateClient.test.ts
git commit -m "feat(research): add fail-loud orchestrateClient (POST scope -> ResearchRun)"
```

---

## Task 5: The `buildScope` intake/scope-extraction shim

**Why:** Intake stays in Node (the spec). The scope-extraction half of the deleted `planRun` (createRunId + SDS review + parseScope + SDS-fold) must survive in a small kept module. It uses only KEPT modules (`scope.ts`, `@/lib/sds/reviewer`); it does NOT plan (the Python tier plans).

**Files:**
- Create: `src/lib/research/buildScope.ts`
- Test: `src/lib/research/__tests__/buildScope.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/research/__tests__/buildScope.test.ts`. (Offline-safe: with no `OPENAI_API_KEY`, `parseScope` returns `emptyScope`, so this needs no network.)

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildScope } from "../buildScope";

describe("buildScope", () => {
  const savedKey = process.env.OPENAI_API_KEY;
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY; // force the deterministic emptyScope path
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  });

  it("returns a ScopePack carrying the description + a fresh run_id and empty sds_reviews", async () => {
    const { scope, sds_reviews } = await buildScope({
      project_description: "Install a coating booth",
      demo_documents: [],
    });
    expect(scope.run_id).toMatch(/^run_/);
    expect(scope.project_change.description).toBe("Install a coating booth");
    expect(scope.facility.jurisdiction_stack.length).toBeGreaterThan(0);
    expect(sds_reviews).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm vitest run src/lib/research/__tests__/buildScope.test.ts
```
Expected: FAIL — cannot import `../buildScope`.

- [ ] **Step 3: Write `buildScope.ts`**

Create `src/lib/research/buildScope.ts`:

```ts
import type { ResearchRunInput, ScopePack } from "./types";
import type { SdsReview } from "@/lib/sds/types";
import { applySdsHandoffToScope, createRunId, parseScope } from "./scope";
import { reviewSdsInputs } from "@/lib/sds/reviewer";

export type BuiltScope = { scope: ScopePack; sds_reviews: SdsReview[] };

// Node-side intake/scope-extraction (kept). Mints the run_id, reviews any SDS docs,
// extracts the ScopePack from the project description, and folds confirmed SDS handoff
// facts into the scope so the family those facts flag is reviewed. It does NOT plan —
// the Python orchestrate tier owns planning. The run_id is carried on the scope so the
// Python pipeline reuses it (plan_candidates reads scope.run_id), threading one id end
// to end.
export async function buildScope(input: ResearchRunInput): Promise<BuiltScope> {
  const run_id = createRunId();
  const sds_reviews = reviewSdsInputs(input.demo_documents ?? [], run_id, { asOfDate: new Date() });
  const base = await parseScope(input, run_id);
  const scope = applySdsHandoffToScope(base, sds_reviews);
  return { scope, sds_reviews };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm vitest run src/lib/research/__tests__/buildScope.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/buildScope.ts src/lib/research/__tests__/buildScope.test.ts
git commit -m "feat(research): add buildScope (Node-side intake/scope-extraction shim)"
```

---

## Task 6: Inline `SCOPE_EXTRACTION_SYSTEM` into `scope.ts`

**Why:** `scope.ts` (KEPT) imports `SCOPE_EXTRACTION_SYSTEM` from `./prompts` (RETIRED in Task 8). Move the constant into `scope.ts` so it survives the deletion.

**Files:**
- Modify: `src/lib/research/scope.ts:4` (drop the import) and add the constant.
- Verify: `src/lib/research/__tests__/scope.test.ts` (imports only `emptyScope`, `scopePackFromFacts` — unaffected, used as a regression check).

- [ ] **Step 1: Replace the import with the inlined constant**

In `src/lib/research/scope.ts`, delete line 4:
```ts
import { SCOPE_EXTRACTION_SYSTEM } from "./prompts";
```
and add this constant immediately after the existing imports (after line 3, `import type { SdsReview } from "@/lib/sds/types";`):

```ts
// Structured fact extraction at intake. Intake-adjacent, not a persona. (Inlined from
// the retired prompts.ts during the Node thin-client cutover so scope.ts is self-contained.)
const SCOPE_EXTRACTION_SYSTEM =
  "You are an EHS intake scoping assistant for Southern California facility/project changes. " +
  "Extract structured facts from the description using the submit_scope tool. State only facts " +
  "that are present or clearly implied; never invent quantities, codes, or equipment. Use null " +
  "for unknown numeric/boolean values and omit unknown lists.";
```

(Leave the usage at `scope.ts:162` — `{ role: "system", content: SCOPE_EXTRACTION_SYSTEM }` — unchanged.)

- [ ] **Step 2: Verify scope tests still pass + typecheck the file**

Run:
```bash
pnpm vitest run src/lib/research/__tests__/scope.test.ts && pnpm typecheck
```
Expected: scope tests PASS. `pnpm typecheck` still PASSES (prompts.ts still exists at this point and is now the only thing that lost a consumer; nothing references the removed import).

- [ ] **Step 3: Commit**

```bash
git add src/lib/research/scope.ts
git commit -m "refactor(research): inline SCOPE_EXTRACTION_SYSTEM into scope.ts"
```

---

## Task 7: Rewire the research route to the endpoint

**Why:** Switch the production research path from the in-Node pipeline to the endpoint: `buildScope → orchestrateClient.runResearch → merge sds_reviews → return`. Remove the durable-runtime branch (it wraps the deleted pipeline and is unused — `RESEARCH_RUNTIME` is unset).

**Files:**
- Modify: `app/api/research/run/route.ts` (full rewrite of the file).
- Test: `app/api/research/run/__tests__/route.test.ts` (new).

- [ ] **Step 1: Write the failing test**

Create `app/api/research/run/__tests__/route.test.ts`. It stubs `buildScope` and the orchestrate client's fetch seam to keep the test offline, and asserts the route returns the run with `sds_reviews` merged.

```ts
import { afterEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "../route";
import { __setFetchForTests } from "@/lib/research/orchestrateClient";

afterEach(() => {
  __setFetchForTests(null);
  delete process.env.MODAL_ORCHESTRATE_ENDPOINT;
  delete process.env.MODAL_RESEARCH_TOKEN;
  delete process.env.OPENAI_API_KEY;
});

// The handler only calls request.json(); a minimal stub avoids any NextRequest runtime
// concerns under vitest+jsdom while staying type-correct.
function req(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("POST /api/research/run", () => {
  it("builds a scope, calls the endpoint, and returns the run", async () => {
    delete process.env.OPENAI_API_KEY; // deterministic emptyScope inside buildScope
    process.env.MODAL_ORCHESTRATE_ENDPOINT = "https://endpoint.test";
    process.env.MODAL_RESEARCH_TOKEN = "t";
    __setFetchForTests(
      (async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            run_id: "run_x",
            status: "done",
            scope_pack: {},
            coverage_family_statuses: [],
            regulatory_angles: [],
            research_graph: [],
            research_tasks: [],
            evidence_bundles: [],
            verification_verdicts: [],
            repair_tickets: [],
            memory_updates: [],
            determinations: [],
            trace_events: [],
            report_markdown: "# r",
          }),
        }) as unknown as Response) as typeof fetch,
    );

    const res = await POST(req({ project_description: "coating booth", demo_documents: [] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report_markdown).toBe("# r");
    expect(json.jurisdiction_stack.length).toBeGreaterThan(0);
    expect(Array.isArray(json.sds_reviews)).toBe(true);
  });

  it("returns a 500 fail-loud error when the endpoint is not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    // no MODAL_ORCHESTRATE_ENDPOINT -> orchestrateClient throws
    const res = await POST(req({ project_description: "x", demo_documents: [] }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.status).toBe("failed");
    expect(String(json.error)).toMatch(/not configured/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm vitest run app/api/research/run/__tests__/route.test.ts
```
Expected: FAIL — the current `route.ts` imports `runResearch` from `@/lib/research/run` and the durable modules; the assertions about merged `sds_reviews`/config error won't hold (and importing the route still pulls the old pipeline).

- [ ] **Step 3: Rewrite `route.ts`**

Replace the entire contents of `app/api/research/run/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { buildScope } from "@/lib/research/buildScope";
import { runResearch } from "@/lib/research/orchestrateClient";

// Hold the serverless function open as long as the Vercel plan allows (60s — the proven
// value the intake route deploys with). The orchestrate Modal endpoint itself runs up to
// 600s (not subject to Vercel limits). A run that needs longer than the Vercel route
// allows is a future durable Function.spawn+poll case (out of scope for this cutover).
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      project_description?: string;
      demo_documents?: Array<{ name: string; type: string; text: string }>;
    };

    // Intake stays in Node: extract the scope (+ SDS review) here, then hand the scope to
    // the Python orchestrate endpoint. sds_reviews are computed Node-side and merged back
    // (the agentic tier does not produce them) so the SDS UI keeps working.
    const { scope, sds_reviews } = await buildScope({
      project_description: body.project_description ?? "",
      demo_documents: body.demo_documents ?? [],
    });

    const run = await runResearch(scope);
    run.sds_reviews = sds_reviews;

    return NextResponse.json(run);
  } catch (error) {
    // Fail-loud: a missing/unreachable endpoint or a non-2xx response surfaces a clear
    // error to the client (no silent fixture fallback). The UI store throws on !res.ok.
    return NextResponse.json(
      {
        run_id: "run_failed",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown research run failure",
      },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm vitest run app/api/research/run/__tests__/route.test.ts
```
Expected: PASS (both cases).

- [ ] **Step 5: Typecheck (still green — old pipeline still present but now unused by the route)**

Run:
```bash
pnpm typecheck
```
Expected: PASS. (`run.ts` and the durable modules still exist and compile; they are simply no longer imported by the route. They are deleted in Task 8.)

- [ ] **Step 6: Commit**

```bash
git add app/api/research/run/route.ts app/api/research/run/__tests__/route.test.ts
git commit -m "feat(research): rewire /api/research/run to the orchestrate endpoint"
```

---

## Task 8: Retire the in-Node TS pipeline

**Why:** The duplicate pipeline is now dead. Delete it, the durable runtime that wraps it, the TS eval scripts that depend on it, and all their tests. `tsc` is the oracle: after the bulk delete, it lists every remaining importer of a deleted module — each is itself dead and gets deleted, until the tree is green.

**Files (delete):**

Source — core pipeline:
- `src/lib/research/run.ts`
- `src/lib/research/planner.ts`
- `src/lib/research/verifier.ts`
- `src/lib/research/synthesis.ts`
- `src/lib/research/orchestration.ts`
- `src/lib/research/completeness.ts`
- `src/lib/research/workers.ts`
- `src/lib/research/researchMode.ts`
- `src/lib/research/liveResearchAgent.ts`
- `src/lib/research/liveWorker.ts`
- `src/lib/research/modal/researchPool.ts`

Source — helpers that become dead with the pipeline:
- `src/lib/research/confidence.ts`
- `src/lib/research/programRegistry.ts`
- `src/lib/research/sdsFamilies.ts`
- `src/lib/research/skillForHypothesis.ts`
- `src/lib/research/skillRegistry.ts`
- `src/lib/research/sourceAllowlist.ts`
- `src/lib/research/toolCatalog.ts`
- `src/lib/research/trace.ts`
- `src/lib/research/prompts.ts`
- `src/lib/research/fixtures/` (whole dir — the fixture source pool, used only by `workers.ts`)

Source — durable runtime (wraps the deleted pipeline; unused, `RESEARCH_RUNTIME` unset):
- `src/lib/research/durable/durableRun.ts`
- `src/lib/research/store/supabaseStore.ts`
- `app/api/research/run/[id]/route.ts` (the durable poll route)

Source — TS eval scripts (depend on `run.ts`; the Python side owns goldens now):
- `src/evals/golden.ts`
- `src/evals/exportGoldens.ts`

Tests — of retired modules:
- `src/lib/research/__tests__/`: `completeness.test.ts`, `confidence.test.ts`, `liveResearchAgent.test.ts`, `orchestration.test.ts`, `planner.test.ts`, `plannerSdsActivation.test.ts`, `programRegistry.test.ts`, `registrySkillsParity.test.ts`, `researchMode.test.ts`, `run.recallFloor.test.ts`, `run.repair.test.ts`, `run.split.test.ts`, `sdsActiveFamilies.test.ts`, `sdsCoverageActivation.test.ts`, `skillRegistry.test.ts`, `skillsParity.test.ts`, `synthesis.test.ts`, `toolCatalog.test.ts`, `verifier.test.ts`, `workers.degraded.test.ts`
- `src/lib/research/modal/__tests__/researchPool.test.ts`
- `src/lib/ui/__tests__/scenarios.smoke.test.ts` and `src/lib/ui/__tests__/sandboxState.test.ts` (both import `runResearch` to generate data through the now-deleted pipeline)

**KEEP (do not delete):** `src/lib/research/scope.ts`, `src/lib/research/types.ts`, `src/lib/research/orchestrateClient.ts`, `src/lib/research/buildScope.ts`, `src/lib/research/__tests__/scope.test.ts`, `src/lib/research/__tests__/orchestrateClient.test.ts`, `src/lib/research/__tests__/buildScope.test.ts`, `src/lib/research/modal/worker.py`, `src/lib/research/modal/worker_core.py`, `src/lib/research/modal/worker_core_test.py`, `src/lib/research/modal/orchestrator.py`, `src/lib/research/skills/` (bundled by `worker.py`), `src/lib/ui/*` (selectors, store, scenarios, sandboxState sources), `app/components/*`, `@/lib/intake/*`, `@/lib/sds/*`.

- [ ] **Step 1: Delete the source modules**

```bash
git rm src/lib/research/run.ts src/lib/research/planner.ts src/lib/research/verifier.ts \
  src/lib/research/synthesis.ts src/lib/research/orchestration.ts src/lib/research/completeness.ts \
  src/lib/research/workers.ts src/lib/research/researchMode.ts src/lib/research/liveResearchAgent.ts \
  src/lib/research/liveWorker.ts src/lib/research/modal/researchPool.ts \
  src/lib/research/confidence.ts src/lib/research/programRegistry.ts src/lib/research/sdsFamilies.ts \
  src/lib/research/skillForHypothesis.ts src/lib/research/skillRegistry.ts src/lib/research/sourceAllowlist.ts \
  src/lib/research/toolCatalog.ts src/lib/research/trace.ts src/lib/research/prompts.ts
git rm -r src/lib/research/fixtures
git rm src/lib/research/durable/durableRun.ts src/lib/research/store/supabaseStore.ts
git rm 'app/api/research/run/[id]/route.ts'   # quote: [id] is a bash glob
git rm src/evals/golden.ts src/evals/exportGoldens.ts
```

- [ ] **Step 2: Delete the tests of retired modules**

```bash
git rm \
  src/lib/research/__tests__/completeness.test.ts \
  src/lib/research/__tests__/confidence.test.ts \
  src/lib/research/__tests__/liveResearchAgent.test.ts \
  src/lib/research/__tests__/orchestration.test.ts \
  src/lib/research/__tests__/planner.test.ts \
  src/lib/research/__tests__/plannerSdsActivation.test.ts \
  src/lib/research/__tests__/programRegistry.test.ts \
  src/lib/research/__tests__/registrySkillsParity.test.ts \
  src/lib/research/__tests__/researchMode.test.ts \
  src/lib/research/__tests__/run.recallFloor.test.ts \
  src/lib/research/__tests__/run.repair.test.ts \
  src/lib/research/__tests__/run.split.test.ts \
  src/lib/research/__tests__/sdsActiveFamilies.test.ts \
  src/lib/research/__tests__/sdsCoverageActivation.test.ts \
  src/lib/research/__tests__/skillRegistry.test.ts \
  src/lib/research/__tests__/skillsParity.test.ts \
  src/lib/research/__tests__/synthesis.test.ts \
  src/lib/research/__tests__/toolCatalog.test.ts \
  src/lib/research/__tests__/verifier.test.ts \
  src/lib/research/__tests__/workers.degraded.test.ts \
  src/lib/research/modal/__tests__/researchPool.test.ts \
  src/lib/ui/__tests__/scenarios.smoke.test.ts \
  src/lib/ui/__tests__/sandboxState.test.ts
```

- [ ] **Step 3: Remove dead package.json scripts**

In `package.json`, delete these three script lines (they invoke the deleted `src/evals/*` files):
```json
"eval": "tsx src/evals/golden.ts",
"export:goldens": "tsx src/evals/exportGoldens.ts",
"check:goldens": "pnpm export:goldens && git diff --exit-code -- research_core/tests/goldens",
```
Leave all other scripts (`build`, `typecheck`, `test`, `test:watch`, `lint`) intact. Ensure the surrounding JSON stays valid (no trailing comma left dangling).

- [ ] **Step 4: Typecheck — follow the errors to find any remaining dead module**

Run:
```bash
pnpm typecheck
```
For each error of the form `Cannot find module './X'` or `'@/lib/research/X' has no exported member`:
- If `X` is one of the deleted modules and the importer is **also** in `src/lib/research/` (a helper not yet on the delete list) or `src/evals/`, that importer is dead too — `git rm` it and re-run.
- If the importer is a **KEPT** file (`scope.ts`, a `src/lib/ui/*` source, an `app/component`, `@/lib/intake/*`, `@/lib/sds/*`), STOP and reconsider: that file needs a real fix, not deletion. (Expected KEPT importers after this cut: none — `scope.ts` was decoupled in Task 6; `selectors.ts`/`store.ts` import only `types.ts`; components import `types`/`selectors`/`store`. `@/lib/sds/*` is self-contained. If `sds/reviewer.ts` or another kept module imports a deleted helper, fix by inlining/removing the dependency.)
Repeat until `pnpm typecheck` reports zero errors.

- [ ] **Step 5: Run the full Node test suite**

Run:
```bash
pnpm test
```
For each failing test file that imports a deleted module, `git rm` it (it tested retired behavior). KEPT test files that should still pass: `scope.test.ts`, `orchestrateClient.test.ts`, `buildScope.test.ts`, `route.test.ts`, `selectors.test.ts`, plus any `@/lib/intake`/`@/lib/sds`/`worker_core` tests. Repeat until `pnpm test` is green.

- [ ] **Step 6: Build**

Run:
```bash
pnpm build
```
Expected: `next build` succeeds. If it fails on a stale import in `app/` (e.g. a component or `app/api/.../route.ts` referencing a deleted module), fix that importer — for app code this means removing the dead import/usage, not deleting the component. (No `app/component` is expected to import a retired module; the UI consumes only `types`/`selectors`/`store`.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(research): retire the in-Node TS research pipeline (full replacement)"
```

---

## Task 9: Env wiring + end-to-end smoke + final gate

**Why:** Wire the endpoint URL into the app's env and prove intake → endpoint → render works end to end, then run the whole gate.

**Files:**
- Modify: `.env.local` (gitignored — do NOT commit) and Vercel project env.

- [ ] **Step 1: Add the endpoint URL to `.env.local`**

Append to `.env.local` (use the URL from Task 3 Step 1; `MODAL_RESEARCH_TOKEN` already exists and is reused):
```bash
printf '\nMODAL_ORCHESTRATE_ENDPOINT=%s\n' "<the deployed orchestrate endpoint URL>" >> .env.local
grep '^MODAL_ORCHESTRATE_ENDPOINT=' .env.local
```
Expected: the line is present. (Do not commit `.env.local`.)

- [ ] **Step 2: Add the same var to Vercel (production)**

```bash
# If the Vercel CLI is linked to this project:
vercel env add MODAL_ORCHESTRATE_ENDPOINT production
# (paste the URL when prompted). Confirm MODAL_RESEARCH_TOKEN already exists in Vercel:
vercel env ls | grep -E "MODAL_ORCHESTRATE_ENDPOINT|MODAL_RESEARCH_TOKEN"
```
Expected: both vars present for production. If the Vercel CLI is not available, note in the PR description that `MODAL_ORCHESTRATE_ENDPOINT` must be added to the Vercel project env before the next deploy.

- [ ] **Step 3: End-to-end smoke via the running dev server**

Start the dev server and exercise the real route (this calls the live endpoint):
```bash
pnpm dev &
sleep 5
curl -sS -X POST http://localhost:3000/api/research/run \
  -H "content-type: application/json" \
  -d '{"project_description":"Install a coating booth using 60 gal of flammable solvent in Fontana, CA","demo_documents":[]}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('status',d.get('status'),'determinations',len(d.get('determinations',[])),'research_graph',len(d.get('research_graph',[])),'report_md_chars',len(d.get('report_markdown','')))"
kill %1
```
Expected: `status` is `needs_review` or `done`, `determinations` > 0, `research_graph` > 0, `report_md_chars` > 0 — i.e. the full run rendered through the Node route from the live endpoint. (If you prefer a UI check: open the app, run a research request, and confirm the applicability matrix, family cards, detail overlay, and report all render.)

- [ ] **Step 4: Fail-loud check via the route**

Temporarily point the route at a bad endpoint to confirm the UI-facing error path:
```bash
MODAL_ORCHESTRATE_ENDPOINT="https://invalid.invalid" pnpm dev &
sleep 5
curl -sS -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/research/run \
  -H "content-type: application/json" -d '{"project_description":"x","demo_documents":[]}'
kill %1
```
Expected: `500` (no determinations; fail-loud). Restore by relying on `.env.local` for subsequent runs.

- [ ] **Step 5: Final gate**

Run the full gate (Node + Python):
```bash
pnpm typecheck && pnpm test && pnpm build
cd /Users/mac/Documents/permitos/research_aiq && PYTHONPATH="$PWD:$PWD/../research_core" .venv/bin/python -m pytest -q
```
Expected: all green — Node typecheck/test/build pass; research_aiq suite passes.

- [ ] **Step 6: Final commit (if anything beyond .env.local changed)**

`.env.local` is gitignored, so there may be nothing to commit here. If any tracked file changed during the smoke fixes:
```bash
git add -A
git commit -m "chore(research): finalize node thin-client cutover"
```

---

## Success criteria (verify before finishing the branch)

- [ ] The orchestrate Modal endpoint is deployed and returns the full run for a scope (token-authed, fail-loud), with a `research_runs` row in Supabase (Task 3).
- [ ] The Node research path calls the endpoint (no TS pipeline); intake + rendering work end to end (Task 9 Step 3).
- [ ] The TS research pipeline modules are deleted; `pnpm typecheck` + `pnpm test` + `pnpm build` pass (Task 8 + Task 9 Step 5).
- [ ] `orchestrateClient` unit tests (success + fail-loud) pass (Task 4).
- [ ] `research_aiq` pytest suite passes after the `finalize` widening (Task 1 + Task 9 Step 5).

## Notes / accepted regressions (not blockers)

- **Sparser trace timeline.** The Python `finalize_run` emits only the synthesis + recall-floor trace events; the richer per-phase trace the deleted `runResearch` added (scope_agent, sds_reviewer, orchestrator coverage/task_graph, research_pool fanout) is gone. The UI replays whatever `trace_events` exist — a shorter timeline, not a breakage. Enriching the Python traces is a possible follow-up.
- **TS goldens export removed.** `research_core` (the Python port) owns its goldens; the TS `export:goldens`/`check:goldens` bridge is deleted with the pipeline.
- **Dev-only fixtures.** The fixture *source pool* (`src/lib/research/fixtures/`) is deleted because only the retired `workers.ts` consumed it; there is no remaining silent production fixture fallback (the whole point of the cutover).
