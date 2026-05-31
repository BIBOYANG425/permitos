"""Modal worker — catalog-governed agentic researcher behind an HTTP endpoint.

The agentic loop + guardrails live in worker_core.run_research_agent (unit-tested
without modal/openai). This module supplies the real llm/fetch/extract functions
and a token-authed FastAPI endpoint. ALL-REASONING: uses a reasoning-tier model for
both the loop and extraction (max_completion_tokens, no temperature, tool_choice=required).

Deploy:  modal deploy src/lib/research/modal/worker.py
Secrets: `permitpilot-openai` (OPENAI_API_KEY), `permitpilot-research` (RESEARCH_TOKEN)
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime, timezone

import modal

from worker_core import (
    EXTRACTION_HINTS,
    SOURCE_POINTERS,
    evidence_row,
    failed_bundle,
    run_research_agent,
)

app = modal.App("permitpilot-research")

image = (
    modal.Image.debian_slim()
    .pip_install("httpx", "pymupdf", "beautifulsoup4", "openai", "fastapi[standard]", "supabase")
    .add_local_python_source("worker_core")
)

MAX_BYTES = 5_000_000
MAX_TEXT_CHARS = 24_000
HTTP_TIMEOUT_S = 15.0

EXTRACT_SYSTEM = (
    "You are an EHS regulatory research assistant. Extract ONLY what the text actually "
    "says. The verbatim_quote MUST be copied exactly from the source text. If the text "
    "does not support a finding, set applies to needs_review and leave verbatim_quote empty."
)


def _model() -> str:
    # All-reasoning worker: default to a reasoning-tier model; operator overrides via env
    # with a reasoning model their OpenAI account has access to.
    return os.environ.get("OPENAI_RESEARCH_MODEL", "o4-mini")


def _fetch_fn(url: str) -> tuple[str, str]:
    import httpx

    with httpx.Client(follow_redirects=True, timeout=HTTP_TIMEOUT_S) as client:
        resp = client.get(url, headers={"User-Agent": "PermitPilot/0.1 (research)"})
        resp.raise_for_status()
        ctype = resp.headers.get("content-type", "").lower()
        data = resp.content[:MAX_BYTES]
    content_hash = "sha256:" + hashlib.sha256(data).hexdigest()
    if "pdf" in ctype or url.lower().endswith(".pdf"):
        import fitz

        doc = fitz.open(stream=data, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
    else:
        from bs4 import BeautifulSoup

        text = BeautifulSoup(data, "html.parser").get_text(" ", strip=True)
    return content_hash, text[:MAX_TEXT_CHARS]


def _to_openai_messages(messages: list[dict]) -> list[dict]:
    """Translate the loop's internal messages into OpenAI chat format.

    Internal assistant turns carry tool_calls as {"id","name","arguments"(dict)};
    internal tool turns carry {"tool_call_id","content"}. System/user pass through.
    """
    out = []
    for m in messages:
        role = m.get("role")
        if role == "assistant" and m.get("tool_calls"):
            out.append({
                "role": "assistant",
                "content": m.get("content") or "",
                "tool_calls": [
                    {"id": c["id"], "type": "function",
                     "function": {"name": c["name"], "arguments": json.dumps(c.get("arguments", {}))}}
                    for c in m["tool_calls"]
                ],
            })
        elif role == "tool":
            out.append({"role": "tool", "tool_call_id": m.get("tool_call_id", ""), "content": m.get("content", "")})
        else:
            out.append({"role": role, "content": m.get("content") or ""})
    return out


def _llm_fn(messages: list[dict], tools: list[dict]) -> dict:
    """One OpenAI chat call. Returns the assistant turn normalized for the loop.

    Does NOT mutate `messages` — the loop records the assistant turn itself.
    Reasoning-model compatible: max_completion_tokens, no temperature.
    """
    from openai import OpenAI

    client = OpenAI()
    kwargs = {"model": _model(), "messages": _to_openai_messages(messages), "max_completion_tokens": 4000}
    if tools:
        kwargs["tools"] = tools
    msg = client.chat.completions.create(**kwargs).choices[0].message
    out = []
    for tc in (msg.tool_calls or []):
        try:
            args = json.loads(tc.function.arguments or "{}")
        except json.JSONDecodeError:
            args = {}
        out.append({"id": tc.id, "name": tc.function.name, "arguments": args})
    return {"content": msg.content, "tool_calls": out}


def _extract_fn(text: str, question: str, hint: dict) -> dict:
    from openai import OpenAI

    client = OpenAI()
    field = hint.get("field", "source_claim")
    ask = hint.get("ask", "the clause that determines whether this requirement applies")
    tool = {
        "type": "function",
        "function": {
            "name": "extract_finding",
            "description": "Return the grounded finding.",
            "parameters": {
                "type": "object",
                "properties": {
                    "field": {"type": "string", "enum": [field]},
                    "threshold_value": {"type": ["number", "null"]},
                    "verbatim_quote": {"type": "string"},
                    "applies": {"type": "string", "enum": ["applies", "does_not_apply", "needs_review"]},
                    "confidence": {"type": "number"},
                },
                "required": ["field", "verbatim_quote", "applies", "confidence"],
            },
        },
    }
    completion = client.chat.completions.create(
        model=_model(),
        messages=[
            {"role": "system", "content": EXTRACT_SYSTEM},
            {"role": "user", "content": f"Research question: {question}\nExtract {ask}.\n\nSOURCE TEXT:\n{text}"},
        ],
        tools=[tool],
        tool_choice="required",
        max_completion_tokens=2000,
    )
    calls = completion.choices[0].message.tool_calls or []
    if not calls:
        return {"field": field, "verbatim_quote": "", "applies": "needs_review", "confidence": 0.3}
    return json.loads(calls[0].function.arguments or "{}")


def _run(task_spec: dict) -> dict:
    hid = task_spec.get("hypothesis_id", "")
    if SOURCE_POINTERS.get(hid) is None:
        return failed_bundle(hid, f"No source pointer for {hid}")
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        return run_research_agent(task_spec, llm_fn=_llm_fn, fetch_fn=_fetch_fn,
                                  extract_fn=_extract_fn, now_iso=now_iso)
    except Exception as exc:  # noqa: BLE001 — never throw out of the worker
        return failed_bundle(hid, f"Agent failed: {exc}")


@app.function(image=image, secrets=[
    modal.Secret.from_name("permitpilot-openai"),
    modal.Secret.from_name("permitpilot-research"),
], timeout=600)
@modal.fastapi_endpoint(method="POST")
def research(payload: dict) -> dict:
    expected = os.environ.get("RESEARCH_TOKEN", "")
    if not expected or payload.get("token") != expected:
        return {"error": "unauthorized"}
    task_spec = payload.get("task_spec") or {}
    return _run(task_spec)


@app.function(image=image, secrets=[modal.Secret.from_name("permitpilot-openai")], timeout=600)
def research_task(task_spec: dict) -> dict:
    return _run(task_spec)


def _supabase():
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def _write_bundle(sb, run_id: str, bundle: dict) -> None:
    sb.table("research_evidence").upsert(evidence_row(run_id, bundle)).execute()


@app.function(image=image, secrets=[
    modal.Secret.from_name("permitpilot-openai"),
    modal.Secret.from_name("permitpilot-supabase"),
], timeout=3600)
def research_run(run_id: str, task_specs: list) -> dict:
    sb = _supabase()
    sb.table("research_runs").update({"status": "running"}).eq("run_id", run_id).execute()
    written = 0
    for result in research_task.map(task_specs):
        _write_bundle(sb, run_id, result)
        written += 1
    sb.table("research_runs").update({"status": "bundles_complete"}).eq("run_id", run_id).execute()
    return {"run_id": run_id, "written": written}


@app.function(image=image, secrets=[
    modal.Secret.from_name("permitpilot-research"),
], timeout=60)
@modal.fastapi_endpoint(method="POST")
def start_run(payload: dict) -> dict:
    expected = os.environ.get("RESEARCH_TOKEN", "")
    if not expected or payload.get("token") != expected:
        return {"error": "unauthorized"}
    run_id = payload.get("run_id")
    task_specs = payload.get("task_specs") or []
    if not run_id:
        return {"error": "missing run_id"}
    research_run.spawn(run_id, task_specs)
    return {"run_id": run_id, "status": "queued"}


@app.local_entrypoint()
def main(task_json: str) -> None:
    result = research_task.remote(json.loads(task_json))
    sys.stdout.write("PERMITPILOT_BUNDLE_JSON " + json.dumps(result) + "\n")
    sys.stdout.flush()
