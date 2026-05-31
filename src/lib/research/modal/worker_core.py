"""Pure helpers for the PermitPilot Modal research worker.

No third-party imports (no modal/httpx/openai) so this is unit-testable in any
plain Python environment. worker.py does the I/O and imports these.
"""
from __future__ import annotations

import json
import re
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


# ---------------------------------------------------------------------------
# Catalog-governed agentic researcher loop
# ---------------------------------------------------------------------------

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

    llm_fn(messages, tools) -> {"content": str|None, "tool_calls": [{"id","name","arguments"}]} | {"tool_calls": []}
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
