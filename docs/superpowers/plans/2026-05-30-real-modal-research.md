# Real Deep Research in the Modal Worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Modal worker do genuine research — fetch the allowlisted official source live, LLM-extract the triggering clause/verbatim quote/threshold, and return a real `EvidenceBundle` — replacing the echo+fixture stand-in. Runs via `USE_MODAL=1` (CLI spawn, local/dev).

**Architecture:** Split pure logic (`worker_core.py`: source-pointer allowlist + `assemble_evidence` + host check — no third-party imports, unit-testable) from I/O (`worker.py`: the Modal function that fetches with `httpx`, parses PDF/HTML, and extracts with OpenAI). The TS bridge spawns `modal run` unchanged (just a longer timeout + passes the hypothesis question). The default in-process fixture pool and the Vercel deployment are untouched.

**Tech Stack:** Python (Modal, httpx, pypdf, beautifulsoup4, openai), TypeScript (the bridge). Base branch: `feat/real-modal-research` off `main`.

**Spec:** `docs/superpowers/specs/2026-05-30-real-modal-research-design.md`

---

## File Structure

- Create: `src/lib/research/modal/worker_core.py` — pure: `SOURCE_POINTERS`, `EXTRACTION_HINTS`, `ALLOWED_HOSTS`, `host_allowed()`, `failed_bundle()`, `assemble_evidence()`. No `modal`/`httpx`/`openai` imports → testable anywhere.
- Create: `src/lib/research/modal/worker_core_test.py` — plain-assert tests (stdlib only), runnable with `python3`.
- Modify (rewrite): `src/lib/research/modal/worker.py` — the Modal function doing fetch/parse/LLM-extract, importing `worker_core`.
- Modify: `src/lib/research/modal/runModalPool.ts` — raise the per-task timeout 30s→90s; pass `question` in the task spec.
- Modify: `docs/MODAL.md` — document real research + prerequisites (Modal secret).

### Task 1: Pure core — registry + assemble_evidence (TDD)

**Files:**
- Create: `src/lib/research/modal/worker_core.py`
- Test: `src/lib/research/modal/worker_core_test.py`

- [ ] **Step 1: Write the failing test**

Create `src/lib/research/modal/worker_core_test.py`:

```python
"""Plain-assert tests for worker_core (no pytest/modal needed).

Run: python3 src/lib/research/modal/worker_core_test.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from worker_core import (  # noqa: E402
    SOURCE_POINTERS,
    assemble_evidence,
    host_allowed,
)

# Hypothesis IDs the planner emits (keep in sync with planner.ts).
PLANNER_HYPOTHESIS_IDS = {
    "H-AIR-201", "H-AIR-VOC", "H-AIR-219", "H-AIR-222",
    "H-STORM-IGP", "H-STORM-CGP", "H-HAZMAT-HMBP",
    "H-WASTE-GENERATOR", "H-WASTEWATER-PRETREATMENT",
}


def test_source_pointer_parity():
    missing = PLANNER_HYPOTHESIS_IDS - set(SOURCE_POINTERS)
    assert not missing, f"SOURCE_POINTERS missing: {missing}"
    for hid, pointer in SOURCE_POINTERS.items():
        assert host_allowed(pointer["url"]), f"{hid} url not allowlisted: {pointer['url']}"


def test_host_allowed():
    assert host_allowed("https://www.aqmd.gov/docs/x.pdf")
    assert host_allowed("https://calepa.ca.gov/cupa/")
    assert not host_allowed("https://evil.example.com/x")
    assert not host_allowed("https://aqmd.gov.evil.com/x")


def test_assemble_evidence_grounded():
    pointer = SOURCE_POINTERS["H-HAZMAT-HMBP"]
    extract = {
        "field": "liquid_gallons_threshold",
        "threshold_value": 55,
        "verbatim_quote": "55 gallons or more of a hazardous liquid",
        "applies": "applies",
        "confidence": 0.88,
    }
    bundle = assemble_evidence("H-HAZMAT-HMBP", pointer, "sha256:abc", "2026-05-30T00:00:00Z", extract)
    assert bundle["hypothesis_id"] == "H-HAZMAT-HMBP"
    assert bundle["sources"][0]["content_hash"] == "sha256:abc"
    assert bundle["sources"][0]["quote"] == "55 gallons or more of a hazardous liquid"
    assert bundle["extracted_claims"][0]["field"] == "liquid_gallons_threshold"
    assert bundle["extracted_claims"][0]["value"] == "55"
    assert bundle["researcher_conclusion"] == "applies"


def test_assemble_evidence_ungrounded_fails_closed():
    pointer = SOURCE_POINTERS["H-AIR-201"]
    extract = {"field": "permit_trigger", "verbatim_quote": "", "applies": "applies", "confidence": 0.9}
    bundle = assemble_evidence("H-AIR-201", pointer, "sha256:abc", "t", extract)
    assert bundle["researcher_conclusion"] == "needs_review"
    assert bundle["sources"] == []
    assert bundle["uncertainties"]


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in tests:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(tests)} passed")
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
cd /Users/mac/Documents/antler-deep-research
python3 src/lib/research/modal/worker_core_test.py
```
Expected: FAIL — `ModuleNotFoundError: No module named 'worker_core'` (not created yet).

- [ ] **Step 3: Implement the pure core**

Create `src/lib/research/modal/worker_core.py`:

```python
"""Pure helpers for the PermitPilot Modal research worker.

No third-party imports (no modal/httpx/openai) so this is unit-testable in any
plain Python environment. worker.py does the I/O and imports these.
"""
from __future__ import annotations

from urllib.parse import urlparse

# hypothesis_id -> the single official source the worker may fetch (the allowlist).
SOURCE_POINTERS: dict[str, dict] = {
    "H-AIR-201": {"source_name": "SCAQMD Rule 201", "url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf", "authority_rank": 1},
    "H-AIR-VOC": {"source_name": "SCAQMD Rule 201", "url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf", "authority_rank": 1},
    "H-AIR-219": {"source_name": "SCAQMD Rule 219", "url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-219.pdf", "authority_rank": 1},
    "H-AIR-222": {"source_name": "SCAQMD Rule 222", "url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-222.pdf", "authority_rank": 1},
    "H-STORM-IGP": {"source_name": "California Industrial General Permit", "url": "https://www.waterboards.ca.gov/water_issues/programs/stormwater/industrial.html", "authority_rank": 1},
    "H-STORM-CGP": {"source_name": "California Construction General Permit", "url": "https://www.waterboards.ca.gov/water_issues/programs/stormwater/construction.html", "authority_rank": 1},
    "H-HAZMAT-HMBP": {"source_name": "California HMBP Threshold Summary", "url": "https://calepa.ca.gov/cupa/hazardous-materials-business-plan/", "authority_rank": 1},
    "H-WASTE-GENERATOR": {"source_name": "EPA Hazardous Waste Generator Categories", "url": "https://www.epa.gov/hwgenerators/categories-hazardous-waste-generators", "authority_rank": 1},
    "H-WASTEWATER-PRETREATMENT": {"source_name": "EPA Pretreatment Program Overview", "url": "https://www.epa.gov/npdes/national-pretreatment-program", "authority_rank": 1},
}

# Per-hypothesis extraction guidance. `field` MUST match what verifier.ts reads
# for its math branches (liquid_gallons_threshold for HMBP); others are informational.
EXTRACTION_HINTS: dict[str, dict] = {
    "H-HAZMAT-HMBP": {"field": "liquid_gallons_threshold", "ask": "the numeric gallon threshold at or above which a Hazardous Materials Business Plan (HMBP) is required for a hazardous liquid"},
    "H-STORM-CGP": {"field": "acreage_threshold", "ask": "the number of acres of soil disturbance that triggers Construction General Permit coverage"},
    "H-STORM-IGP": {"field": "regulated_sic", "ask": "which industrial activities or SIC categories must obtain Industrial General Permit coverage"},
    "H-AIR-201": {"field": "permit_trigger", "ask": "what equipment or activity requires written authorization or a permit to construct"},
    "H-AIR-VOC": {"field": "permit_trigger", "ask": "what equipment or activity requires written authorization or a permit to construct"},
    "H-AIR-219": {"field": "exemption_check_required", "ask": "which equipment is exempt from written permit requirements and under what conditions"},
    "H-AIR-222": {"field": "registration_possible", "ask": "which equipment may use registration instead of a full permit"},
    "H-WASTE-GENERATOR": {"field": "generator_quantity_required", "ask": "what monthly hazardous waste quantity determines the generator category"},
    "H-WASTEWATER-PRETREATMENT": {"field": "process_discharge_required", "ask": "when industrial process wastewater discharge triggers pretreatment requirements"},
}

ALLOWED_HOSTS = {
    "www.aqmd.gov", "aqmd.gov",
    "www.waterboards.ca.gov", "waterboards.ca.gov",
    "calepa.ca.gov", "www.calepa.ca.gov",
    "www.epa.gov", "epa.gov",
}


def host_allowed(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in ALLOWED_HOSTS


def failed_bundle(hypothesis_id: str, reason: str) -> dict:
    return {
        "hypothesis_id": hypothesis_id,
        "sources": [],
        "extracted_claims": [],
        "researcher_conclusion": "needs_review",
        "uncertainties": [reason],
    }


def assemble_evidence(hypothesis_id: str, pointer: dict, content_hash: str, fetched_at: str, extract: dict) -> dict:
    """Pure mapping: extraction result + fetch metadata -> EvidenceBundle dict.

    Falls back to needs_review when no verbatim quote was grounded.
    """
    quote = (extract.get("verbatim_quote") or "").strip()
    if not quote:
        return failed_bundle(hypothesis_id, "No supporting verbatim quote found in the fetched source.")

    field = extract.get("field") or "source_claim"
    value = extract.get("threshold_value")
    applies = extract.get("applies") or "needs_review"
    try:
        confidence = float(extract.get("confidence"))
    except (TypeError, ValueError):
        confidence = 0.5

    return {
        "hypothesis_id": hypothesis_id,
        "sources": [
            {
                "url": pointer["url"],
                "source_name": pointer["source_name"],
                "authority_rank": pointer["authority_rank"],
                "fetched_at": fetched_at,
                "content_hash": content_hash,
                "effective_date": extract.get("effective_date"),
                "quote": quote,
            }
        ],
        "extracted_claims": [
            {
                "field": field,
                "value": "" if value is None else str(value),
                "source_url": pointer["url"],
                "quote": quote,
                "confidence": confidence,
            }
        ],
        "researcher_conclusion": applies if applies in ("applies", "does_not_apply", "needs_review") else "needs_review",
        "uncertainties": [],
    }
```

- [ ] **Step 4: Run it to verify it passes**

Run:
```bash
cd /Users/mac/Documents/antler-deep-research
python3 src/lib/research/modal/worker_core_test.py
```
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/modal/worker_core.py src/lib/research/modal/worker_core_test.py
git commit -m "feat(modal): pure research core — source-pointer allowlist + assemble_evidence"
```

### Task 2: The Modal worker (fetch + parse + LLM-extract)

**Files:**
- Modify (rewrite): `src/lib/research/modal/worker.py`

- [ ] **Step 1: Replace `worker.py` with the real researcher**

Replace the entire contents of `src/lib/research/modal/worker.py` with:

```python
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
import io
import json
import os
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
    .pip_install("httpx", "pypdf", "beautifulsoup4", "openai")
    .add_local_python_source("worker_core")
)

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
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
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
    if quote and quote not in text:
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
```

- [ ] **Step 2: Byte-compile check (cannot run Modal here)**

Run:
```bash
cd /Users/mac/Documents/antler-deep-research
python3 -m py_compile src/lib/research/modal/worker.py && echo "worker.py compiles"
```
Expected: `worker.py compiles` (syntax valid). Note: this does not import `modal`; it only checks syntax. The actual run is verified later with `USE_MODAL=1` on a machine with the modal CLI.

If `add_local_python_source` is unavailable in the installed Modal version, the fallback is `.add_local_dir(os.path.dirname(__file__), remote_path="/root")` or upgrading modal; this only surfaces at first `modal run`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/research/modal/worker.py
git commit -m "feat(modal): worker fetches allowlisted source + LLM-extracts grounded finding"
```

### Task 3: Bridge — longer timeout + pass the question

**Files:**
- Modify: `src/lib/research/modal/runModalPool.ts`

- [ ] **Step 1: Raise the per-task timeout**

In `src/lib/research/modal/runModalPool.ts`, change:
```ts
const DEFAULT_TIMEOUT_MS = 30_000;
```
to:
```ts
// Real fetch + PDF parse + LLM extraction is slower than the old fixture echo.
const DEFAULT_TIMEOUT_MS = 90_000;
```

- [ ] **Step 2: Pass the hypothesis question into the task spec**

In the same file, change:
```ts
  const taskSpec = {
    task_id: task.task_id,
    hypothesis_id: hypothesis.id,
  };
```
to:
```ts
  const taskSpec = {
    task_id: task.task_id,
    hypothesis_id: hypothesis.id,
    question: hypothesis.question,
  };
```

- [ ] **Step 3: Verify TS still typechecks/builds**

Run:
```bash
cd /Users/mac/Documents/antler-deep-research
pnpm typecheck && pnpm build 2>&1 | grep -E "Compiled successfully|Failed|error TS" | head -3
```
Expected: typecheck clean; build compiles. (`runModalPool.ts` is only imported when `USE_MODAL=1`, so the default path is unaffected.)

- [ ] **Step 4: Run the existing test suite (default fixture path stays green)**

Run:
```bash
cd /Users/mac/Documents/antler-deep-research
pnpm test 2>&1 | tail -4
```
Expected: all tests pass (the change doesn't touch the default pool or any test fixture).

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/modal/runModalPool.ts
git commit -m "feat(modal): 90s per-task budget + pass hypothesis question to the worker"
```

### Task 4: Docs — real research + prerequisites

**Files:**
- Modify: `docs/MODAL.md`

- [ ] **Step 1: Update the architecture + add prerequisites**

In `docs/MODAL.md`, under the `## Architecture` section, replace the bullet describing the worker as an `echo`/fixture stand-in with:

```markdown
- `src/lib/research/modal/worker.py` — Modal app `permitpilot-research`.
  For each task it fetches the allowlisted official `.gov` source (`SOURCE_POINTERS`
  in `worker_core.py`), parses PDF (`pypdf`) or HTML (`beautifulsoup4`), and asks
  `gpt-4o-mini` to extract the triggering clause + a **verbatim quote** + threshold.
  The quote is grounding-checked (must be a substring of the fetched text); any
  fetch/parse/extract failure or missing quote degrades to a `needs_review` bundle.
- `src/lib/research/modal/worker_core.py` — pure registry + `assemble_evidence`,
  unit-tested via `python3 src/lib/research/modal/worker_core_test.py` (no Modal needed).
```

Then add a `## Prerequisites for real research` section:

```markdown
## Prerequisites for real research

```bash
modal setup                                            # Modal account + free credits
modal secret create permitpilot-openai OPENAI_API_KEY=sk-...
USE_MODAL=1 pnpm eval                                  # exercises the real worker
```

Without these, leave `USE_MODAL` unset — the in-process fixture pool runs (and is
what the Vercel deployment uses; the `modal` CLI cannot run there).
```

- [ ] **Step 2: Commit**

```bash
git add docs/MODAL.md
git commit -m "docs(modal): document real research worker + prerequisites"
```

## Self-Review

**Spec coverage:**
- Source-pointer allowlist (keep URLs, drop baked quotes) → Task 1 (`SOURCE_POINTERS`).
- Modal executes fetch+parse+extract → Task 2 (`worker.py`).
- Local/dev via CLI spawn, Vercel keeps fixtures → unchanged bridge mechanism (Task 3) + docs (Task 4).
- Extractor↔verifier field contract → Task 1 `EXTRACTION_HINTS` (`liquid_gallons_threshold`, `acreage_threshold`) + the grounding guard in Task 2; verifier needs no change (it already `needs_review`s on absent threshold).
- Fail-closed error handling → Task 2 (`failed_bundle` on every failure path) + Task 1 (ungrounded → needs_review).
- Pure logic unit-tested without Modal → Task 1 (`worker_core_test.py`).
- Bridge timeout 30→90s → Task 3.
- Prerequisites (secret, USE_MODAL) → Task 4.
- Verification on the user's machine → Task 2 Step 2 note + Task 4.

**Placeholder scan:** every code step has complete file contents or exact before/after edits. The only deliberately deferred item is the live `modal run` (unrunnable here), flagged explicitly with the `add_local_python_source` fallback.

**Type/name consistency:** `assemble_evidence(hypothesis_id, pointer, content_hash, fetched_at, extract)` and `failed_bundle(hypothesis_id, reason)` and `host_allowed(url)` are defined in Task 1 and imported unchanged in Task 2. `SOURCE_POINTERS`/`EXTRACTION_HINTS` keys are the same 9 hypothesis IDs the planner emits (asserted by the parity test). The emitted `field` names (`liquid_gallons_threshold`, `acreage_threshold`) match what `verifier.ts` reads. The bundle shape matches the existing `EvidenceBundle` (sources[].{url,source_name,authority_rank,fetched_at,content_hash,effective_date,quote}, extracted_claims[].{field,value,source_url,quote,confidence}, researcher_conclusion, uncertainties).
```
