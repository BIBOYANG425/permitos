# Deployed Modal Endpoint + Catalog-Governed Agentic Worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the real Modal research path reachable from the deployed Vercel app via an HTTP endpoint, and turn the sandbox worker into a hybrid agentic researcher whose tool set is governed by the existing TypeScript tool catalog / skill registry, with harness-enforced scope, budget, grounding, and a deterministic fallback.

**Architecture:** The Python worker's agentic loop is extracted into the already-unit-tested `worker_core.py` with **injected** `llm_fn` / `fetch_fn` / `extract_fn` so it is fully testable without Modal, OpenAI, or the network. `worker.py` wires the real implementations behind a token-authed `@modal.fastapi_endpoint`. On the Node side, a new `researchPool.ts` replaces the `modal run` CLI subprocess with an HTTP `fetch`, returning `{ bundles, degraded? }`; `workers.ts`/`run.ts` fall back to fixtures + a visible degraded trace when Modal is unreachable.

**Tech Stack:** TypeScript (Next.js 15, vitest), Python 3 (Modal 1.4.x, FastAPI endpoint, httpx, pymupdf, OpenAI), plain-assert Python tests.

**Spec:** `docs/superpowers/specs/2026-05-30-modal-endpoint-agentic-worker-design.md`

---

## File Structure

- `src/lib/research/planner.ts` (MODIFY) — researcher `budget.max_model_calls` 2 → 4.
- `src/lib/research/modal/worker_core.py` (MODIFY) — add tool schemas, scope filtering, the injectable agentic loop `run_research_agent`, grounding guard reuse, deterministic fallback. Pure/injectable.
- `src/lib/research/modal/worker_core_test.py` (MODIFY) — add agentic-loop tests (happy path, scope refusal, allowed-tools filtering, grounding guard, budget fallback).
- `src/lib/research/modal/worker.py` (MODIFY) — real `llm_fn`/`fetch_fn`/`extract_fn`; token-authed `@modal.fastapi_endpoint` calling `run_research_agent`; keep `@app.local_entrypoint` for debug.
- `src/lib/research/modal/researchPool.ts` (CREATE) — HTTP fetch bridge; `__setFetchForTests`; returns `ResearchPoolResult = { bundles, degraded? }`.
- `src/lib/research/modal/__tests__/researchPool.test.ts` (CREATE) — injected-fetch unit tests.
- `src/lib/research/workers.ts` (MODIFY) — extract `runFixturePool`; `runLocalResearchPool` returns `ResearchPoolResult`; call `researchPool` and substitute fixtures on degraded.
- `src/lib/research/run.ts` (MODIFY) — consume `{ bundles, degraded }`; emit degraded trace.
- `src/lib/research/modal/runModalPool.ts` (DELETE in Task 5) + `src/lib/research/modal/__tests__/runModalPool.test.ts` (DELETE in Task 5).
- `docs/MODAL_DEPLOYMENT.md` (CREATE) — operator runbook.

**Test commands:**
- TS: `pnpm test` (vitest), `pnpm typecheck`, `pnpm build`
- Python: `python3 src/lib/research/modal/worker_core_test.py` (no pytest/modal needed)

---

### Task 1: Raise the researcher model-call budget

The agentic loop needs room for `fetch_source` → `prove_currency` → `extract_threshold` rounds. Today `max_model_calls` is 2.

**Files:**
- Modify: `src/lib/research/planner.ts:242-246`
- Test: `src/lib/research/__tests__/planner.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/research/__tests__/planner.test.ts` (inside the existing top-level `describe`, or add one):

```typescript
import { describe, it, expect } from "vitest";
import { planResearch } from "../planner";
import { scopePackFromFacts } from "../scope";

describe("researcher budget", () => {
  it("gives each research task at least 4 model calls for the agentic loop", () => {
    const scope = scopePackFromFacts(
      {
        facility: { address: "X", naics: null, sic: null },
        project_change: {
          equipment: [{ kind: "coating_booth", description: "booth" }],
          chemicals: [{ name: "solvent", quantity: 60, unit: "gal", hazard: "flammable" }],
          waste_streams: [],
          disturbance_acres: null,
          process_discharge: null,
        },
        missing_facts: [],
        assumptions: [],
      },
      "run_test",
      "test"
    );
    const plan = planResearch(scope);
    expect(plan.research_tasks.length).toBeGreaterThan(0);
    expect(plan.research_tasks.every((t) => t.budget.max_model_calls >= 4)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- planner`
Expected: FAIL — `max_model_calls` is 2, so `every(... >= 4)` is `false`.

- [ ] **Step 3: Make the change**

In `src/lib/research/planner.ts`, in `taskForHypothesis`, change the budget block:

```typescript
    budget: {
      max_sources: 3,
      max_runtime_seconds: 30,
      max_model_calls: 4
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- planner`
Expected: PASS (all planner tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/planner.ts src/lib/research/__tests__/planner.test.ts
git commit -m "feat(planner): raise researcher max_model_calls 2->4 for the agentic loop"
```

---

### Task 2: Agentic loop in `worker_core.py` (pure, injectable)

Add the catalog-governed agentic researcher as pure logic with injected `llm_fn`/`fetch_fn`/`extract_fn`. No modal/openai/httpx imports — keeps `worker_core` unit-testable.

**Files:**
- Modify: `src/lib/research/modal/worker_core.py`
- Test: `src/lib/research/modal/worker_core_test.py`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/research/modal/worker_core_test.py` (before the `if __name__` block), and add `run_research_agent` to the import at the top:

```python
from worker_core import (  # noqa: E402
    SOURCE_POINTERS,
    assemble_evidence,
    host_allowed,
    run_research_agent,
    exposed_tool_schemas,
)

RESEARCHER_ALLOWED = [
    "get_triggers", "get_source_pointers", "get_cached_source", "fetch_source",
    "prove_currency", "extract_threshold", "evaluate_predicate", "quarantine_injection",
]
RESEARCHER_BLOCKED = [
    "get_form", "build_applicability_matrix", "generate_compliance_calendar",
    "assemble_review_package", "freshness_sweep", "propose_map_entry", "propose_form_entry",
]


def _spec(allowed=RESEARCHER_ALLOWED, blocked=RESEARCHER_BLOCKED, max_calls=4, max_sources=3):
    return {
        "hypothesis_id": "H-HAZMAT-HMBP",
        "question": "What gallon threshold triggers an HMBP?",
        "allowed_tools": allowed,
        "blocked_tools": blocked,
        "budget": {"max_model_calls": max_calls, "max_sources": max_sources, "max_runtime_seconds": 30},
    }


def _tc(call_id, name, args):
    """A single OpenAI-style tool call (carries an id used for tool_call_id linkage)."""
    return {"id": call_id, "name": name, "arguments": args}


def _scripted_llm(*responses):
    """Returns an llm_fn yielding the given responses in order, then an empty turn."""
    state = {"n": 0}

    def llm_fn(messages, tools):
        i = state["n"]
        state["n"] += 1
        return responses[i] if i < len(responses) else {"content": "done", "tool_calls": []}

    return llm_fn


def test_exposed_tool_schemas_filters_to_allowed():
    schemas = exposed_tool_schemas(["fetch_source", "extract_threshold", "get_form"])
    names = {s["function"]["name"] for s in schemas}
    # get_form is not an implemented researcher tool -> never exposed
    assert names == {"fetch_source", "extract_threshold"}


def test_agent_happy_path_fetch_then_submit():
    llm = _scripted_llm(
        {"tool_calls": [_tc("c1", "fetch_source", {"url": SOURCE_POINTERS["H-HAZMAT-HMBP"]["url"]})]},
        {"tool_calls": [_tc("c2", "extract_threshold", {
            "field": "liquid_gallons_threshold", "threshold_value": 55,
            "verbatim_quote": "55 gallons or more", "applies": "applies", "confidence": 0.9})]},
    )
    fetch_fn = lambda url: ("sha256:x", "A facility storing 55 gallons or more must file an HMBP.")
    bundle = run_research_agent(_spec(), llm_fn=llm, fetch_fn=fetch_fn, extract_fn=None, now_iso="t")
    assert bundle["researcher_conclusion"] == "applies"
    assert bundle["sources"][0]["quote"] == "55 gallons or more"
    assert bundle["extracted_claims"][0]["value"] == "55"


def test_agent_grounding_guard_blanks_ungrounded_quote():
    llm = _scripted_llm(
        {"tool_calls": [_tc("c1", "fetch_source", {})]},
        {"tool_calls": [_tc("c2", "extract_threshold", {
            "field": "liquid_gallons_threshold", "verbatim_quote": "NOT IN THE TEXT",
            "applies": "applies", "confidence": 0.9})]},
    )
    fetch_fn = lambda url: ("sha256:x", "Totally unrelated source text.")
    bundle = run_research_agent(_spec(), llm_fn=llm, fetch_fn=fetch_fn, extract_fn=None, now_iso="t")
    # ungrounded quote blanked -> assemble_evidence fails closed
    assert bundle["researcher_conclusion"] == "needs_review"
    assert bundle["sources"] == []


def test_agent_refuses_blocked_tool_and_continues():
    # First turn calls a BLOCKED tool (must be refused, run continues), then the
    # allowed fetch -> submit path completes.
    llm = _scripted_llm(
        {"tool_calls": [_tc("c1", "build_applicability_matrix", {})]},
        {"tool_calls": [_tc("c2", "fetch_source", {})]},
        {"tool_calls": [_tc("c3", "extract_threshold", {
            "field": "f", "verbatim_quote": "the text", "applies": "applies", "confidence": 0.8})]},
    )
    fetch_fn = lambda url: ("sha256:x", "the text says the rule applies")
    bundle = run_research_agent(_spec(max_calls=5), llm_fn=llm, fetch_fn=fetch_fn, extract_fn=None, now_iso="t")
    assert bundle["researcher_conclusion"] == "applies"
    assert bundle["sources"][0]["quote"] == "the text"


def test_agent_budget_exhaustion_uses_deterministic_fallback():
    # llm never submits (keeps calling get_triggers); budget=1 -> deterministic fallback.
    llm = _scripted_llm({"tool_calls": [_tc("c1", "get_triggers", {})]})
    fetch_fn = lambda url: ("sha256:x", "fallback source mentioning 55 gallons or more")
    extract_fn = lambda text, question, hint: {
        "field": "liquid_gallons_threshold", "threshold_value": 55,
        "verbatim_quote": "55 gallons or more", "applies": "applies", "confidence": 0.7}
    bundle = run_research_agent(_spec(max_calls=1), llm_fn=llm, fetch_fn=fetch_fn, extract_fn=extract_fn, now_iso="t")
    assert bundle["researcher_conclusion"] == "applies"
    assert bundle["extracted_claims"][0]["field"] == "liquid_gallons_threshold"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 src/lib/research/modal/worker_core_test.py`
Expected: FAIL — `ImportError: cannot import name 'run_research_agent'` (and `exposed_tool_schemas`).

- [ ] **Step 3: Implement in `worker_core.py`**

Add to `src/lib/research/modal/worker_core.py` (after `assemble_evidence`). Note `_norm_ws` is duplicated here (worker.py also has one) — `worker_core` must stay import-free of worker.py:

```python
import re

# The research skill's done-condition (keep in sync with skillRegistry.ts `research`).
RESEARCH_SKILL_PROMPT = (
    "You are a permit-research subagent. Investigate ONE hypothesis. Use the provided "
    "tools to load the official source pointer, fetch the allowlisted source, and prove "
    "currency, then call extract_threshold with the grounded finding. The verbatim_quote "
    "MUST be copied exactly from the fetched source text. If you cannot ground a finding, "
    "call extract_threshold with applies=needs_review and an empty verbatim_quote. "
    "You may only use the tools you are given."
)

# OpenAI function schemas, keyed by catalog tool id. Only researcher tools we actually
# implement appear here; everything else (get_form, build_applicability_matrix, ...) is
# therefore never exposable, and is also hard-refused by the dispatcher.
TOOL_SCHEMAS: dict[str, dict] = {
    "get_source_pointers": {
        "type": "function",
        "function": {
            "name": "get_source_pointers",
            "description": "Return the allowlisted official source URL and authority rank for this hypothesis.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    "get_triggers": {
        "type": "function",
        "function": {
            "name": "get_triggers",
            "description": "Return the threshold/predicate extraction hint for this hypothesis.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    "fetch_source": {
        "type": "function",
        "function": {
            "name": "fetch_source",
            "description": "Fetch an allowlisted source URL and return its content hash and extracted text.",
            "parameters": {
                "type": "object",
                "properties": {"url": {"type": "string"}},
            },
        },
    },
    "prove_currency": {
        "type": "function",
        "function": {
            "name": "prove_currency",
            "description": "Classify the fetched source as current, stale, or unconfirmed.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    "evaluate_predicate": {
        "type": "function",
        "function": {
            "name": "evaluate_predicate",
            "description": "Record evaluation of the trigger predicate against project attributes.",
            "parameters": {"type": "object", "properties": {"note": {"type": "string"}}},
        },
    },
    "extract_threshold": {
        "type": "function",
        "function": {
            "name": "extract_threshold",
            "description": "Submit the grounded finding. Terminal — ends the investigation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "field": {"type": "string"},
                    "threshold_value": {"type": ["number", "null"]},
                    "triggering_clause": {"type": "string"},
                    "verbatim_quote": {"type": "string"},
                    "applies": {"type": "string", "enum": ["applies", "does_not_apply", "needs_review"]},
                    "confidence": {"type": "number"},
                },
                "required": ["field", "verbatim_quote", "applies", "confidence"],
            },
        },
    },
}

# Non-LLM-callable researcher tools (allowed in scope but not offered as model tools):
# get_cached_source (no cache in demo) and quarantine_injection (embedded in fetch_source).
_NON_CALLABLE = {"get_cached_source", "quarantine_injection"}


def _norm_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def exposed_tool_schemas(allowed_tools: list[str]) -> list[dict]:
    """The OpenAI tools to offer = allowed_tools that we actually implement as model tools."""
    return [TOOL_SCHEMAS[t] for t in allowed_tools if t in TOOL_SCHEMAS]


def run_research_agent(task_spec: dict, *, llm_fn, fetch_fn, extract_fn, now_iso: str,
                       source_pointers: dict | None = None) -> dict:
    """Catalog-governed agentic researcher.

    llm_fn(messages, tools) -> {"tool_calls": [{"name": str, "arguments": dict}]} | {"tool_calls": []}
    fetch_fn(url) -> (content_hash, text)
    extract_fn(text, question, hint) -> extract dict   (used only by the deterministic fallback)
    """
    pointers = source_pointers if source_pointers is not None else SOURCE_POINTERS
    hid = task_spec.get("hypothesis_id", "")
    question = task_spec.get("question") or hid
    allowed = set(task_spec.get("allowed_tools", []))
    blocked = set(task_spec.get("blocked_tools", []))
    budget = task_spec.get("budget", {}) or {}
    max_calls = int(budget.get("max_model_calls", 4))
    max_sources = int(budget.get("max_sources", 3))

    pointer = pointers.get(hid)
    if pointer is None:
        return failed_bundle(hid, f"No source pointer for {hid}")

    tools = exposed_tool_schemas(list(allowed))
    messages = [
        {"role": "system", "content": RESEARCH_SKILL_PROMPT},
        {"role": "user", "content": f"Hypothesis {hid}. Question: {question}"},
    ]

    fetched_text = ""
    content_hash = ""
    sources_used = 0

    for _ in range(max_calls):
        resp = llm_fn(messages, tools)
        calls = resp.get("tool_calls") or []
        # Record the assistant turn before any tool results (OpenAI ordering rule).
        messages.append({"role": "assistant", "content": resp.get("content"), "tool_calls": calls})
        if not calls:
            break
        for call in calls:
            name = call.get("name", "")
            args = call.get("arguments", {}) or {}
            call_id = call.get("id", "")

            # Scope enforcement: refuse blocked / non-permitted / non-callable tools, keep going.
            if name in blocked or (name not in allowed) or (name in _NON_CALLABLE):
                messages.append({"role": "tool", "tool_call_id": call_id, "name": name,
                                 "content": json.dumps({"error": f"tool '{name}' is not permitted for this skill"})})
                continue

            if name == "extract_threshold":
                extract = dict(args)
                quote = (extract.get("verbatim_quote") or "").strip()
                grounded = bool(quote) and _norm_ws(quote) in _norm_ws(fetched_text)
                if quote and not grounded:
                    extract["verbatim_quote"] = ""
                    extract["applies"] = "needs_review"
                extract.setdefault("field", EXTRACTION_HINTS.get(hid, {}).get("field", "source_claim"))
                return assemble_evidence(hid, pointer, content_hash, now_iso, extract)

            if name == "get_source_pointers":
                payload = {"url": pointer["url"], "source_name": pointer["source_name"],
                           "authority_rank": pointer["authority_rank"]}
            elif name == "get_triggers":
                payload = EXTRACTION_HINTS.get(hid, {})
            elif name == "fetch_source":
                if sources_used >= max_sources:
                    payload = {"error": "max_sources budget exceeded"}
                else:
                    url = args.get("url") or pointer["url"]
                    if not host_allowed(url):
                        payload = {"error": f"host not allowlisted: {url}"}
                    else:
                        content_hash, fetched_text = fetch_fn(url)
                        sources_used += 1
                        payload = {"content_hash": content_hash, "text": fetched_text}
            elif name == "prove_currency":
                payload = {"status": "unconfirmed" if not fetched_text else "current"}
            elif name == "evaluate_predicate":
                payload = {"note": args.get("note", "predicate recorded")}
            else:
                payload = {"error": f"unknown tool '{name}'"}

            messages.append({"role": "tool", "tool_call_id": call_id, "name": name, "content": json.dumps(payload)})

    # Budget exhausted without a grounded submit -> deterministic fetch+extract fallback.
    return _deterministic_fallback(hid, pointer, question, fetch_fn, extract_fn, now_iso, fetched_text, content_hash)


def _deterministic_fallback(hid, pointer, question, fetch_fn, extract_fn, now_iso, fetched_text, content_hash) -> dict:
    if not fetched_text:
        try:
            content_hash, fetched_text = fetch_fn(pointer["url"])
        except Exception as exc:  # noqa: BLE001
            return failed_bundle(hid, f"Fallback fetch failed: {exc}")
    if extract_fn is None:
        return failed_bundle(hid, "Budget exhausted with no grounded finding.")
    extract = extract_fn(fetched_text, question, EXTRACTION_HINTS.get(hid, {}))
    quote = (extract.get("verbatim_quote") or "").strip()
    if quote and _norm_ws(quote) not in _norm_ws(fetched_text):
        extract["verbatim_quote"] = ""
        extract["applies"] = "needs_review"
    return assemble_evidence(hid, pointer, content_hash, now_iso, extract)
```

Add `import json` at the top of `worker_core.py` if not present (it is not currently — add it next to `from urllib.parse import urlparse`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 src/lib/research/modal/worker_core_test.py`
Expected: PASS — all tests print `ok ...` and a final `N passed` count.

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/modal/worker_core.py src/lib/research/modal/worker_core_test.py
git commit -m "feat(worker): catalog-governed agentic loop in worker_core (pure, injectable)"
```

---

### Task 3: Real implementations + token-authed endpoint in `worker.py`

Wire OpenAI/httpx into the injected functions and expose the agentic researcher behind a token-authed Modal web endpoint.

**Files:**
- Modify: `src/lib/research/modal/worker.py`

Verification here is by syntax + import (no network/LLM in CI); a live smoke is documented in Task 6.

- [ ] **Step 1: Rewrite `worker.py`**

Replace the contents of `src/lib/research/modal/worker.py` with:

```python
"""Modal worker — catalog-governed agentic researcher behind an HTTP endpoint.

The agentic loop + guardrails live in worker_core.run_research_agent (unit-tested
without modal/openai). This module supplies the real llm/fetch/extract functions
and a token-authed FastAPI endpoint.

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
    failed_bundle,
    run_research_agent,
)

app = modal.App("permitpilot-research")

image = (
    modal.Image.debian_slim()
    .pip_install("httpx", "pymupdf", "beautifulsoup4", "openai", "fastapi[standard]")
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


def _model() -> str:
    return os.environ.get("OPENAI_INTAKE_MODEL", "gpt-4o-mini")


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
    """
    from openai import OpenAI

    client = OpenAI()
    kwargs = {"model": _model(), "messages": _to_openai_messages(messages), "max_tokens": 700}
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
        tool_choice={"type": "function", "function": {"name": "extract_finding"}},
        max_tokens=600,
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
], timeout=180)
@modal.fastapi_endpoint(method="POST")
def research(payload: dict) -> dict:
    expected = os.environ.get("RESEARCH_TOKEN", "")
    if not expected or payload.get("token") != expected:
        return {"error": "unauthorized"}
    task_spec = payload.get("task_spec") or {}
    return _run(task_spec)


@app.function(image=image, secrets=[modal.Secret.from_name("permitpilot-openai")], timeout=180)
def research_task(task_spec: dict) -> dict:
    return _run(task_spec)


@app.local_entrypoint()
def main(task_json: str) -> None:
    result = research_task.remote(json.loads(task_json))
    sys.stdout.write("PERMITPILOT_BUNDLE_JSON " + json.dumps(result) + "\n")
    sys.stdout.flush()
```

- [ ] **Step 2: Syntax + import check**

Run:
```bash
python3 -c "import ast; ast.parse(open('src/lib/research/modal/worker.py').read()); print('syntax ok')"
~/.local/bin/uv run --with modal python3 -c "import sys; sys.path.insert(0,'src/lib/research/modal'); import worker; print('import ok', [f for f in dir(worker) if not f.startswith('__')][:6])"
```
Expected: `syntax ok` then `import ok [...]`. (If the `uv` modal env path differs, use the project's modal interpreter; the goal is that `@modal.fastapi_endpoint` resolves on the installed modal version.)

- [ ] **Step 3: Confirm worker_core tests still pass (unchanged contract)**

Run: `python3 src/lib/research/modal/worker_core_test.py`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/research/modal/worker.py
git commit -m "feat(worker): token-authed fastapi endpoint + real llm/fetch/extract wiring"
```

---

### Task 4: HTTP transport bridge `researchPool.ts`

New Node bridge that `fetch`es the deployed endpoint per task, with a `__setFetchForTests` seam and a `ResearchPoolResult` return type. Does not yet replace `runModalPool` (Task 5 does the swap) so the build stays green.

**Files:**
- Create: `src/lib/research/modal/researchPool.ts`
- Test: `src/lib/research/modal/__tests__/researchPool.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/research/modal/__tests__/researchPool.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResearchHypothesis, ResearchTask } from "../../types";
import { __setFetchForTests, runModalResearchPool } from "../researchPool";

const task = (hid: string): ResearchTask => ({
  task_id: `T-${hid}`,
  hypothesis_id: hid,
  assigned_agent: "modal-worker",
  allowed_tools: ["fetch_source", "extract_threshold"],
  blocked_tools: ["get_form"],
  budget: { max_sources: 3, max_runtime_seconds: 30, max_model_calls: 4 },
});
const hyp = (hid: string): ResearchHypothesis => ({
  id: hid, angle_id: "A", family: "air", question: "?",
  required_facts: [], expected_source_type: "regulation", success_criteria: [], dependencies: [],
});

function okResponse(hid: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      hypothesis_id: hid,
      sources: [{ url: "u", source_name: "s", authority_rank: 1, fetched_at: "t", content_hash: "h", effective_date: null, quote: "q" }],
      extracted_claims: [{ field: "f", value: "v", source_url: "u", quote: "q", confidence: 0.9 }],
      researcher_conclusion: "applies",
      uncertainties: [],
    }),
  } as unknown as Response;
}

describe("runModalResearchPool (http)", () => {
  afterEach(() => {
    __setFetchForTests(null);
    delete process.env.MODAL_RESEARCH_ENDPOINT;
    delete process.env.MODAL_RESEARCH_TOKEN;
  });

  it("posts one request per task and returns parsed bundles", async () => {
    process.env.MODAL_RESEARCH_ENDPOINT = "https://x.modal.run/research";
    process.env.MODAL_RESEARCH_TOKEN = "secret";
    const fake = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return okResponse(body.task_spec.hypothesis_id);
    });
    __setFetchForTests(fake as unknown as typeof fetch);

    const res = await runModalResearchPool([task("H-AIR-201"), task("H-AIR-219")], [hyp("H-AIR-201"), hyp("H-AIR-219")]);

    expect(fake).toHaveBeenCalledTimes(2);
    expect(res.degraded).toBeUndefined();
    expect(res.bundles.map((b) => b.hypothesis_id).sort()).toEqual(["H-AIR-201", "H-AIR-219"]);
    const sentSpec = JSON.parse(String((fake.mock.calls[0][1] as RequestInit).body)).task_spec;
    expect(sentSpec.allowed_tools).toContain("extract_threshold");
    expect(sentSpec.blocked_tools).toContain("get_form");
  });

  it("flags degraded (no requests) when env is unset", async () => {
    const fake = vi.fn();
    __setFetchForTests(fake as unknown as typeof fetch);
    const res = await runModalResearchPool([task("H-AIR-201")], [hyp("H-AIR-201")]);
    expect(fake).not.toHaveBeenCalled();
    expect(res.degraded?.reason).toMatch(/not configured/i);
    expect(res.bundles).toEqual([]);
  });

  it("returns a per-task failure bundle on HTTP 500 (not global degraded) when others succeed", async () => {
    process.env.MODAL_RESEARCH_ENDPOINT = "https://x.modal.run/research";
    process.env.MODAL_RESEARCH_TOKEN = "secret";
    let n = 0;
    __setFetchForTests((async (_u: string, init?: RequestInit) => {
      n += 1;
      const body = JSON.parse(String(init?.body));
      if (n === 1) return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      return okResponse(body.task_spec.hypothesis_id);
    }) as unknown as typeof fetch);

    const res = await runModalResearchPool([task("H-AIR-201"), task("H-AIR-219")], [hyp("H-AIR-201"), hyp("H-AIR-219")]);
    expect(res.degraded).toBeUndefined();
    const failed = res.bundles.find((b) => b.researcher_conclusion === "needs_review");
    expect(failed).toBeDefined();
    expect(res.bundles.some((b) => b.researcher_conclusion === "applies")).toBe(true);
  });

  it("flags degraded when EVERY task fails at transport level", async () => {
    process.env.MODAL_RESEARCH_ENDPOINT = "https://x.modal.run/research";
    process.env.MODAL_RESEARCH_TOKEN = "secret";
    __setFetchForTests((async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch);
    const res = await runModalResearchPool([task("H-AIR-201"), task("H-AIR-219")], [hyp("H-AIR-201"), hyp("H-AIR-219")]);
    expect(res.degraded?.reason).toMatch(/unreachable/i);
    expect(res.bundles).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- researchPool`
Expected: FAIL — cannot resolve `../researchPool`.

- [ ] **Step 3: Implement `researchPool.ts`**

Create `src/lib/research/modal/researchPool.ts`:

```typescript
import type { EvidenceBundle, ResearchHypothesis, ResearchTask } from "../types";

export type ResearchPoolResult = {
  bundles: EvidenceBundle[];
  degraded?: { reason: string };
};

// DI seam: tests inject a fake fetch (vi.mock of global fetch is unreliable under
// this vitest config). Mirrors __setSpawnForTests from the old CLI bridge.
export type FetchFn = typeof fetch;
let fetchImpl: FetchFn | null = null;
export function __setFetchForTests(fn: FetchFn | null): void {
  fetchImpl = fn;
}
function getFetch(): FetchFn {
  return fetchImpl ?? fetch;
}

const REQUEST_TIMEOUT_MS = 120_000;

type TaskOutcome = { bundle: EvidenceBundle; transportError: boolean };

export async function runModalResearchPool(
  tasks: ResearchTask[],
  hypotheses: ResearchHypothesis[]
): Promise<ResearchPoolResult> {
  const endpoint = process.env.MODAL_RESEARCH_ENDPOINT;
  const token = process.env.MODAL_RESEARCH_TOKEN;
  if (!endpoint || !token) {
    return { bundles: [], degraded: { reason: "Modal endpoint not configured" } };
  }

  const byId = new Map(hypotheses.map((h) => [h.id, h]));
  const outcomes = await Promise.all(
    tasks.map((task) => runSingleTask(endpoint, token, task, byId.get(task.hypothesis_id)))
  );

  // Global degraded only when EVERY task failed at transport level (endpoint down).
  if (outcomes.length > 0 && outcomes.every((o) => o.transportError)) {
    return { bundles: [], degraded: { reason: "Modal endpoint unreachable" } };
  }
  return { bundles: outcomes.map((o) => o.bundle) };
}

async function runSingleTask(
  endpoint: string,
  token: string,
  task: ResearchTask,
  hypothesis: ResearchHypothesis | undefined
): Promise<TaskOutcome> {
  if (!hypothesis) {
    return { bundle: failedBundle(task.hypothesis_id, `Missing hypothesis for ${task.task_id}`), transportError: false };
  }
  const task_spec = {
    task_id: task.task_id,
    hypothesis_id: hypothesis.id,
    question: hypothesis.question,
    allowed_tools: task.allowed_tools,
    blocked_tools: task.blocked_tools,
    budget: task.budget,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await getFetch()(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, task_spec }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      // 401/5xx = endpoint-level failure -> transport error (may trigger global degraded).
      return { bundle: failedBundle(hypothesis.id, `Modal endpoint HTTP ${resp.status}`), transportError: true };
    }
    const parsed = (await resp.json()) as EvidenceBundle & { error?: string };
    if (parsed.error) {
      return { bundle: failedBundle(hypothesis.id, `Modal endpoint error: ${parsed.error}`), transportError: true };
    }
    if (!parsed.hypothesis_id) parsed.hypothesis_id = hypothesis.id;
    return { bundle: parsed, transportError: false };
  } catch (err) {
    return {
      bundle: failedBundle(hypothesis.id, err instanceof Error ? err.message : "Modal request failed"),
      transportError: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

function failedBundle(hypothesis_id: string, reason: string): EvidenceBundle {
  return {
    hypothesis_id,
    sources: [],
    extracted_claims: [],
    researcher_conclusion: "needs_review",
    uncertainties: [reason],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- researchPool`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/lib/research/modal/researchPool.ts src/lib/research/modal/__tests__/researchPool.test.ts
git commit -m "feat(research): HTTP Modal transport bridge with degraded detection"
```

---

### Task 5: Wire the pool result + degraded trace; remove the CLI bridge

Switch `workers.ts` to the HTTP pool, return `ResearchPoolResult`, substitute fixtures on degraded, and emit the degraded trace in `run.ts`. Delete the obsolete CLI bridge.

**Files:**
- Modify: `src/lib/research/workers.ts`
- Modify: `src/lib/research/run.ts:53-54`
- Delete: `src/lib/research/modal/runModalPool.ts`, `src/lib/research/modal/__tests__/runModalPool.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/research/__tests__/workers.degraded.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { runLocalResearchPool } from "../workers";
import { planResearch } from "../planner";
import { scopePackFromFacts } from "../scope";

function plan() {
  const scope = scopePackFromFacts(
    {
      facility: { address: "X", naics: null, sic: null },
      project_change: {
        equipment: [{ kind: "coating_booth", description: "b" }],
        chemicals: [], waste_streams: [], disturbance_acres: null, process_discharge: null,
      },
      missing_facts: [], assumptions: [],
    },
    "run_test", "test"
  );
  return planResearch(scope);
}

describe("runLocalResearchPool degraded fallback", () => {
  afterEach(() => {
    delete process.env.USE_MODAL;
    delete process.env.MODAL_RESEARCH_ENDPOINT;
    delete process.env.MODAL_RESEARCH_TOKEN;
  });

  it("falls back to fixture bundles and reports degraded when Modal is unconfigured", async () => {
    process.env.USE_MODAL = "1"; // endpoint env intentionally unset
    const p = plan();
    const result = await runLocalResearchPool(p.research_tasks, p.research_graph);
    expect(result.degraded?.reason).toMatch(/not configured/i);
    // fixture substitution: one bundle per task, not empty
    expect(result.bundles.length).toBe(p.research_tasks.length);
  });

  it("returns fixture bundles with no degraded flag when USE_MODAL is off", async () => {
    const p = plan();
    const result = await runLocalResearchPool(p.research_tasks, p.research_graph);
    expect(result.degraded).toBeUndefined();
    expect(result.bundles.length).toBe(p.research_tasks.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- workers.degraded`
Expected: FAIL — `runLocalResearchPool` currently returns `EvidenceBundle[]` (no `.degraded`/`.bundles`), and the Modal branch imports the deleted-soon CLI module.

- [ ] **Step 3: Rewrite `workers.ts`**

Replace `src/lib/research/workers.ts` lines 1–28 (the imports + `runLocalResearchPool`) with:

```typescript
import type { EvidenceBundle, ResearchHypothesis, ResearchTask } from "./types";
import { sourceFixtures } from "./fixtures/sources";
import type { ResearchPoolResult } from "./modal/researchPool";

export async function runLocalResearchPool(
  tasks: ResearchTask[],
  hypotheses: ResearchHypothesis[]
): Promise<ResearchPoolResult> {
  if (process.env.USE_MODAL === "1") {
    const { runModalResearchPool } = await import("./modal/researchPool");
    const result = await runModalResearchPool(tasks, hypotheses);
    if (result.degraded) {
      // Honest fallback: still render the demo on fixtures, but surface the reason.
      return { bundles: runFixturePool(tasks, hypotheses), degraded: result.degraded };
    }
    return { bundles: result.bundles };
  }

  return { bundles: runFixturePool(tasks, hypotheses) };
}

function runFixturePool(tasks: ResearchTask[], hypotheses: ResearchHypothesis[]): EvidenceBundle[] {
  const byId = new Map(hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));
  return tasks.map((task) => {
    const hypothesis = byId.get(task.hypothesis_id);
    if (!hypothesis) {
      return failedBundle(task.hypothesis_id, `Missing hypothesis for task ${task.task_id}`);
    }
    return runResearchTask(task, hypothesis);
  });
}
```

(Leave `runResearchTask`, `fixtureForHypothesis`, `preliminaryConclusion`, and `failedBundle` below unchanged. The old `Promise.allSettled` wrapper is replaced by the synchronous `runFixturePool` map since `runResearchTask` is synchronous.)

- [ ] **Step 4: Update `run.ts` to consume the result + emit the degraded trace**

In `src/lib/research/run.ts`, replace lines 53–54:

```typescript
  const initialEvidence = await runLocalResearchPool(plan.research_tasks, plan.research_graph);
  trace_events.push(trace(run_id, "research_pool", "fanout", "done", "Local worker pool returned evidence bundles"));
```

with:

```typescript
  const poolResult = await runLocalResearchPool(plan.research_tasks, plan.research_graph);
  const initialEvidence = poolResult.bundles;
  if (poolResult.degraded) {
    trace_events.push(
      trace(run_id, "research_pool", "fanout", "needs_review",
        `⚠ Modal unreachable — using cached fixtures (${poolResult.degraded.reason})`)
    );
  } else {
    trace_events.push(trace(run_id, "research_pool", "fanout", "done", "Research worker pool returned evidence bundles"));
  }
```

- [ ] **Step 5: Delete the obsolete CLI bridge**

```bash
git rm src/lib/research/modal/runModalPool.ts src/lib/research/modal/__tests__/runModalPool.test.ts
```

- [ ] **Step 6: Run the full suite + typecheck + build**

Run:
```bash
pnpm test -- workers.degraded
pnpm test
pnpm typecheck
pnpm build
```
Expected: the new test PASSES; full suite green (the deleted `runModalPool.test.ts` is gone, no references remain); typecheck + build clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(research): use HTTP Modal pool, fixture+degraded-trace fallback; drop CLI bridge"
```

---

### Task 6: Operator deployment runbook

Document the operator steps (deploy, secret, Vercel env) and a live smoke check. No code — a focused runbook.

**Files:**
- Create: `docs/MODAL_DEPLOYMENT.md`

- [ ] **Step 1: Write the runbook**

Create `docs/MODAL_DEPLOYMENT.md`:

```markdown
# Modal research endpoint — deployment

The research workers run as a Modal app exposed over HTTP so the deployed Vercel app
can reach them. Without these steps the app falls back to cached fixtures and shows a
`⚠ Modal unreachable` trace (it never crashes).

## One-time setup

1. **Auth + OpenAI secret** (already done if intake works):
   - `modal setup`
   - `modal secret create permitpilot-openai OPENAI_API_KEY=sk-...`
2. **Research token secret** — a shared bearer token the endpoint checks:
   - `modal secret create permitpilot-research RESEARCH_TOKEN=$(openssl rand -hex 24)`
   - Copy the token value you generated; you set the SAME value in Vercel below.

## Deploy

```bash
modal deploy src/lib/research/modal/worker.py
```

This prints a web endpoint URL like:
`https://<workspace>--permitpilot-research-research.modal.run`

## Vercel environment variables

In the Vercel project (Settings → Environment Variables), set for Production + Preview:

| Name | Value |
|------|-------|
| `USE_MODAL` | `1` |
| `MODAL_RESEARCH_ENDPOINT` | the deployed endpoint URL |
| `MODAL_RESEARCH_TOKEN` | the same token from `permitpilot-research` |

Redeploy the Vercel app so the env vars take effect.

## Smoke check (live)

```bash
curl -s -X POST "$MODAL_RESEARCH_ENDPOINT" \
  -H 'content-type: application/json' \
  -d '{"token":"'"$MODAL_RESEARCH_TOKEN"'","task_spec":{
        "hypothesis_id":"H-AIR-201","question":"What requires a permit to construct?",
        "allowed_tools":["get_source_pointers","get_triggers","fetch_source","prove_currency","extract_threshold","evaluate_predicate","quarantine_injection","get_cached_source"],
        "blocked_tools":["get_form","build_applicability_matrix"],
        "budget":{"max_sources":3,"max_runtime_seconds":30,"max_model_calls":4}}}'
```

Expect a JSON `EvidenceBundle` with a `sources[0].quote` grounded in SCAQMD Rule 201.
A `{"error":"unauthorized"}` response means the token doesn't match the secret.
```

- [ ] **Step 2: Commit**

```bash
git add docs/MODAL_DEPLOYMENT.md
git commit -m "docs: Modal endpoint deployment runbook"
```

---

## Final Verification (after all tasks)

```bash
python3 src/lib/research/modal/worker_core_test.py   # Python agentic-loop tests
pnpm test                                            # full TS suite
pnpm typecheck
pnpm build
```

All green = ready for the final review and PR. The live endpoint behavior (Success
Criteria 1) is validated by the operator via Task 6's smoke check after `modal deploy`.
```
