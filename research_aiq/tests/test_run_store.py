from research_aiq.run_store import RunStore, current_run_id, set_run_id


def test_store_accumulates_and_dedupes_bundles():
    s = RunStore()
    s.init("r1", scope={"run_id": "r1"}, candidates=[{"id": "H-A"}])
    s.add_bundles("r1", [{"hypothesis_id": "H-A", "sources": []}])
    s.add_bundles("r1", [{"hypothesis_id": "H-A", "sources": [{"url": "x"}]}])  # dup id -> last wins
    assert len(s.bundles("r1")) == 1
    assert s.bundles("r1")[0]["sources"] == [{"url": "x"}]
    assert s.investigated_ids("r1") == ["H-A"]


def test_contextvar_run_id_roundtrip():
    token = set_run_id("r2")
    assert current_run_id() == "r2"
    token.var.reset(token)  # reset the ContextVar back to its prior value
