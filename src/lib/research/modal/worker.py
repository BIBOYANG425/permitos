"""Modal worker — real research: fetch the allowlisted source, LLM-extract the
triggering clause/quote/threshold, return an EvidenceBundle.

Pure registry + assembly live in worker_core.py (unit-tested without modal).

Invocation:
    modal run src/lib/research/modal/worker.py \
      --task-json '{"task_id":"T-1","hypothesis_id":"H-AIR-201","question":"Does the coating booth need an SCAQMD permit?"}'

Prereqs: `modal setup`; a Modal secret `permitpilot-openai` holding OPENAI_API_KEY.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

import modal

from worker_core import (
    EXTRACTION_HINTS,
    SOURCE_POINTERS,
    assemble_evidence,
    failed_bundle,
    host_allowed,
)

app = modal.App("permitpilot-research")

# worker_core is a local module the function needs at runtime.
image = (
    modal.Image.debian_slim()
    .pip_install("httpx", "pymupdf", "beautifulsoup4", "openai")
    .add_local_python_source("worker_core")
)


def _norm_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()

MAX_BYTES = 5_000_000
MAX_TEXT_CHARS = 24_000
HTTP_TIMEOUT_S = 15.0

EXTRACT_SYSTEM = (
    "You are an EHS regulatory research assistant. You are given the text of an "
    "official regulatory source and a research question. Extract ONLY what the "
    "text actually says. The verbatim_quote MUST be copied exactly from the source "
    "text. If the text does not support a finding, set applies to needs_review and "
    "leave verbatim_quote empty. Never invent thresholds or quotes."
)


def _extract_tool(field: str) -> dict:
    return {
        "type": "function",
        "function": {
            "name": "extract_finding",
            "description": "Return the grounded finding for the research question.",
            "parameters": {
                "type": "object",
                "properties": {
                    "field": {"type": "string", "enum": [field]},
                    "threshold_value": {"type": ["number", "null"]},
                    "triggering_clause": {"type": "string"},
                    "verbatim_quote": {"type": "string"},
                    "applies": {"type": "string", "enum": ["applies", "does_not_apply", "needs_review"]},
                    "confidence": {"type": "number"},
                },
                "required": ["field", "verbatim_quote", "applies", "confidence"],
            },
        },
    }


def _fetch_and_parse(url: str) -> tuple[str, str]:
    import httpx

    with httpx.Client(follow_redirects=True, timeout=HTTP_TIMEOUT_S) as client:
        resp = client.get(url, headers={"User-Agent": "PermitPilot/0.1 (research)"})
        resp.raise_for_status()
        ctype = resp.headers.get("content-type", "").lower()
        data = resp.content[:MAX_BYTES]

    content_hash = "sha256:" + hashlib.sha256(data).hexdigest()

    if "pdf" in ctype or url.lower().endswith(".pdf"):
        import fitz  # pymupdf — far more robust text extraction than pypdf

        doc = fitz.open(stream=data, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
    else:
        from bs4 import BeautifulSoup

        text = BeautifulSoup(data, "html.parser").get_text(" ", strip=True)

    return content_hash, text[:MAX_TEXT_CHARS]


def _extract(text: str, question: str, hint: dict) -> dict:
    from openai import OpenAI

    client = OpenAI()  # OPENAI_API_KEY from the Modal secret env
    field = hint.get("field", "source_claim")
    ask = hint.get("ask", "the clause that determines whether this requirement applies")
    model = os.environ.get("OPENAI_INTAKE_MODEL", "gpt-4o-mini")

    completion = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": EXTRACT_SYSTEM},
            {"role": "user", "content": f"Research question: {question}\nExtract {ask}.\n\nSOURCE TEXT:\n{text}"},
        ],
        tools=[_extract_tool(field)],
        tool_choice={"type": "function", "function": {"name": "extract_finding"}},
        max_tokens=600,
    )

    tool_calls = completion.choices[0].message.tool_calls or []
    if not tool_calls:
        return {"field": field, "verbatim_quote": "", "applies": "needs_review", "confidence": 0.3}

    out = json.loads(tool_calls[0].function.arguments or "{}")
    # Grounding guard: the quote must literally appear in the fetched text.
    quote = (out.get("verbatim_quote") or "").strip()
    # Grounding guard (whitespace-tolerant): the quote must appear in the fetched
    # text once whitespace is normalized (PDF/HTML extraction spacing is irregular).
    grounded = bool(quote) and _norm_ws(quote) in _norm_ws(text)
    if quote and not grounded:
        out["verbatim_quote"] = ""
        out["applies"] = "needs_review"
    out.setdefault("field", field)
    return out


@app.function(image=image, secrets=[modal.Secret.from_name("permitpilot-openai")], timeout=120)
def research_task(task_spec: dict) -> dict:
    hypothesis_id = task_spec.get("hypothesis_id", "")
    question = task_spec.get("question") or hypothesis_id
    pointer = SOURCE_POINTERS.get(hypothesis_id)
    if pointer is None:
        return failed_bundle(hypothesis_id, f"No source pointer for {hypothesis_id}")
    if not host_allowed(pointer["url"]):
        return failed_bundle(hypothesis_id, f"Refused non-allowlisted host for {pointer['url']}")

    try:
        content_hash, text = _fetch_and_parse(pointer["url"])
    except Exception as exc:  # noqa: BLE001 — fail closed with the reason
        return failed_bundle(hypothesis_id, f"Fetch/parse failed: {exc}")

    if not text.strip():
        return failed_bundle(hypothesis_id, "Fetched source had no extractable text.")

    try:
        extract = _extract(text, question, EXTRACTION_HINTS.get(hypothesis_id, {}))
    except Exception as exc:  # noqa: BLE001
        return failed_bundle(hypothesis_id, f"Extraction failed: {exc}")

    fetched_at = datetime.now(timezone.utc).isoformat()
    return assemble_evidence(hypothesis_id, pointer, content_hash, fetched_at, extract)


@app.local_entrypoint()
def main(task_json: str) -> None:
    task_spec = json.loads(task_json)
    result = research_task.remote(task_spec)
    # Single marked JSON line on stdout for the TS bridge to grep.
    sys.stdout.write("PERMITPILOT_BUNDLE_JSON " + json.dumps(result) + "\n")
    sys.stdout.flush()
