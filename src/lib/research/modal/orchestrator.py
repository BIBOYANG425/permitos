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
permitpilot-supabase (SUPABASE_URL, SUPABASE_SERVICE_KEY), permitpilot-worker-endpoint
(MODAL_RESEARCH_ENDPOINT — the deployed worker `research` URL the internal fan-out calls,
provided at RUNTIME via secret so each environment points at its own worker, not baked
into the image at build time).
Image env: OPENAI_ORCHESTRATION_MODEL (gpt-5.2, the cost-optimal).

Deploy from the repo root:  modal deploy src/lib/research/modal/orchestrator.py
"""

import asyncio
import json
import os

import modal

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
        modal.Secret.from_name("permitpilot-worker-endpoint"),
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
