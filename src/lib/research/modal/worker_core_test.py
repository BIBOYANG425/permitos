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
