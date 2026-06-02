import asyncio
import json

import pytest

from research_aiq.functions.spawn_researchers import _spawn_impl
from research_aiq.run_store import STORE, set_run_id


def _seed(run_id):
    STORE.init(
        run_id,
        scope={"run_id": run_id},
        candidates=[{"id": "H-A", "family": "air"}, {"id": "H-B", "family": "hazmat"}],
    )
    set_run_id(run_id)


def test_spawn_accumulates_bundles_and_returns_distilled():
    _seed("s1")

    async def fake_fanout(ids):  # stand-in for the Modal call
        return [
            {
                "hypothesis_id": i,
                "sources": [{"url": "x", "quote": "q"}],
                "researcher_conclusion": "applies",
                "extracted_claims": [],
                "uncertainties": [],
            }
            for i in ids
        ]

    out = asyncio.run(
        _spawn_impl(json.dumps({"hypothesis_ids": ["H-A", "H-BOGUS"]}), fanout=fake_fanout, run_id="s1")
    )
    parsed = json.loads(out)
    assert STORE.investigated_ids("s1") == ["H-A"]  # only the valid candidate
    assert parsed["investigated"][0]["hypothesis_id"] == "H-A"
    assert parsed["investigated"][0]["grounded"] is True
    assert "H-BOGUS" in parsed["rejected"]


def test_spawn_fail_loud_on_total_fanout_failure():
    _seed("s2")

    async def boom(ids):
        raise RuntimeError("modal unreachable")

    with pytest.raises(RuntimeError):
        asyncio.run(_spawn_impl(json.dumps({"hypothesis_ids": ["H-A"]}), fanout=boom, run_id="s2"))
