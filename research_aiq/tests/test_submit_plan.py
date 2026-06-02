import asyncio
import json

from research_aiq.functions.submit_plan import _submit_impl
from research_aiq.run_store import STORE, set_run_id


def test_submit_records_rationale_and_returns_ok():
    STORE.init("sub1", scope={"run_id": "sub1"}, candidates=[])
    set_run_id("sub1")
    out = asyncio.run(_submit_impl(json.dumps({"rationale": "hazmat irrelevant"}), run_id="sub1"))
    parsed = json.loads(out)
    assert parsed["ok"] is True
    assert parsed["rationale"] == "hazmat irrelevant"
    assert "hazmat irrelevant" in STORE.notes("sub1")


def test_submit_tolerates_missing_rationale():
    STORE.init("sub2", scope={"run_id": "sub2"}, candidates=[])
    set_run_id("sub2")
    out = asyncio.run(_submit_impl(json.dumps({}), run_id="sub2"))
    parsed = json.loads(out)
    assert parsed["ok"] is True
    assert parsed["rationale"] == ""
