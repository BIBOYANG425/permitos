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
        # research_tasks (Modal task_specs) — spawn_researchers forwards these to fanout.
        tasks=[
            {"hypothesis_id": "H-A", "allowed_tools": ["fetch_source"], "budget": {}},
            {"hypothesis_id": "H-B", "allowed_tools": ["fetch_source"], "budget": {}},
        ],
    )
    set_run_id(run_id)


def test_spawn_accumulates_bundles_and_returns_distilled():
    _seed("s1")

    async def fake_fanout(task_specs):  # stand-in for the Modal call; receives task_specs
        # Assert _spawn_impl forwarded the real task_spec (not a bare id) for the
        # accepted hypothesis — proves the run-store task lookup is wired through.
        assert task_specs == [
            {"hypothesis_id": "H-A", "allowed_tools": ["fetch_source"], "budget": {}}
        ]
        return [
            {
                "hypothesis_id": spec["hypothesis_id"],
                "sources": [{"url": "x", "quote": "q"}],
                "researcher_conclusion": "applies",
                "extracted_claims": [],
                "uncertainties": [],
            }
            for spec in task_specs
        ]

    out = asyncio.run(
        _spawn_impl(
            json.dumps({"hypothesis_ids": ["H-A", "H-BOGUS"]}), fanout=fake_fanout, run_id="s1"
        )
    )
    parsed = json.loads(out)
    assert STORE.investigated_ids("s1") == ["H-A"]  # only the valid candidate
    assert parsed["investigated"][0]["hypothesis_id"] == "H-A"
    assert parsed["investigated"][0]["grounded"] is True
    assert "H-BOGUS" in parsed["rejected"]


def test_spawn_fail_loud_on_total_fanout_failure():
    _seed("s2")

    async def boom(task_specs):
        raise RuntimeError("modal unreachable")

    with pytest.raises(RuntimeError):
        asyncio.run(_spawn_impl(json.dumps({"hypothesis_ids": ["H-A"]}), fanout=boom, run_id="s2"))
