# research_core/tests/test_parity.py
"""THE offline gate. Re-derive each pipeline artifact in Python from the golden
inputs (seeded ScopePack + fixture evidence) and assert canonical equality with
the committed golden. trace_events are excluded (timestamps); report_markdown is
checked structurally, not byte-exact."""
from __future__ import annotations
import json
from pathlib import Path
import pytest
from tests.canonicalize import canonical

GOLDEN_DIR = Path(__file__).parent / "goldens"
CASES = ["complex", "construction", "missing_facts"]

def load(case: str) -> dict:
    return json.loads((GOLDEN_DIR / f"{case}.json").read_text())

@pytest.fixture(params=CASES)
def golden(request) -> dict:
    return load(request.param)

# --- Plan parity (Task 8) ---
@pytest.mark.skip(reason="planner not ported yet")
def test_plan_parity(golden):
    from research_core.planner import plan_research
    plan = plan_research(golden["scope_pack"], [])
    for key in ("coverage_family_statuses", "regulatory_angles", "research_graph", "research_tasks"):
        assert canonical(_as_dicts(plan[key])) == canonical(golden["plan"][key]), key

# --- Verdict + repaired-evidence parity (Tasks 9) ---
@pytest.mark.skip(reason="verifier not ported yet")
def test_verdict_parity(golden):
    from research_core.pipeline import run_verification
    out = run_verification(golden["scope_pack"], golden["fixture_evidence"])
    assert canonical(_as_dicts(out["verification_verdicts"])) == canonical(golden["verification_verdicts"])
    assert canonical(_as_dicts(out["evidence_bundles"])) == canonical(golden["evidence_bundles"])

# --- Determinations + status parity (Tasks 10-13: synthesis, completeness, pipeline) ---
@pytest.mark.skip(reason="pipeline not ported yet")
def test_determinations_parity(golden):
    from research_core.pipeline import finalize_run
    result = finalize_run(golden["run_id"], golden["scope_pack"], golden["fixture_evidence"])
    assert canonical(_as_dicts(result["determinations"])) == canonical(golden["determinations"])
    assert result["status"] == golden["status"]

# --- report_markdown STRUCTURAL parity (Task 10) ---
@pytest.mark.skip(reason="synthesis not ported yet")
def test_report_markdown_structural(golden):
    from research_core.pipeline import finalize_run
    result = finalize_run(golden["run_id"], golden["scope_pack"], golden["fixture_evidence"])
    md = result["report_markdown"]
    for det in golden["determinations"]:
        assert det["requirement"] in md, det["requirement"]

def _as_dicts(value):
    """Coerce dataclass instances to plain dicts for comparison."""
    import dataclasses
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {k: _as_dicts(v) for k, v in dataclasses.asdict(value).items()}
    if isinstance(value, dict):
        return {k: _as_dicts(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_as_dicts(v) for v in value]
    return value
