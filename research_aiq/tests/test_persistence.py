import research_aiq.persistence as p


def test_build_run_row_shape():
    metrics = {
        "status": "needs_review",
        "n_determinations": 10,
        "n_verified": 3,
        "n_needs_review": 7,
        "n_investigated": 10,
        "n_invariant_violations": 0,
        "model": "gpt-5.2",
        "invariant_violations": [],
    }
    row = p.build_run_row("run-x", metrics)
    assert row == {
        "run_id": "run-x",
        "model": "gpt-5.2",
        "status": "needs_review",
        "n_determinations": 10,
        "n_verified": 3,
        "n_needs_review": 7,
        "n_investigated": 10,
        "n_invariant_violations": 0,
    }


def test_build_scorecard_row_shape():
    sidecar = {
        "evaluators_primary": {"expected_program_recall": 1.0, "grounding_faithfulness": 1.0},
        "evaluators_directional": {"determination_accuracy": 0.62},
        "aggregate": {
            "n_runs": 12,
            "total_cost_usd": 0.15,
            "cost_per_determination_p50_usd": 0.002,
            "cost_per_determination_p95_usd": 0.004,
        },
        "spawn_latency_ms": {"avg_ms": 19000.0, "p95_ms": 54000.0, "usage_count": 19},
    }
    row = p.build_scorecard_row(sidecar, "gpt-5.2")
    assert row["model"] == "gpt-5.2"
    assert row["n_runs"] == 12
    assert row["recall"] == 1.0 and row["grounding"] == 1.0 and row["accuracy"] == 0.62
    assert row["total_cost_usd"] == 0.15
    assert row["cost_per_determination_p50_usd"] == 0.002
    assert row["spawn_latency_avg_ms"] == 19000.0 and row["spawn_latency_p95_ms"] == 54000.0


def test_persist_run_no_env_is_noop(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    assert p.persist_run("run-x", {"model": "gpt-5.2"}) is None  # no raise


def test_persist_scorecard_failsoft_on_post_error(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "k")

    def boom(table, row):
        raise OSError("network down")

    monkeypatch.setattr(p, "_post_row", boom)
    assert p.persist_scorecard({"aggregate": {}}, "gpt-5.2") is None  # swallowed, no raise
