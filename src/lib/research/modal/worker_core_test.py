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
    run_research_agent,
    exposed_tool_schemas,
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


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in tests:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(tests)} passed")
