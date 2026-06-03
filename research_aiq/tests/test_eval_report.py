import math
from pathlib import Path

from research_aiq.eval_report import (
    MODEL_PRICING,
    aggregate_run_metrics,
    build_scorecard,
    cost_from_usage,
    derive_run_metrics,
    load_eval_output,
    percentile,
    render_scorecard_md,
)

_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "nat_eval_output"


def test_cost_from_usage_uses_per_model_pricing():
    usage = {"gpt-5.2": {"input_tokens": 1_000_000, "output_tokens": 1_000_000}}
    assert cost_from_usage(usage, MODEL_PRICING) == 1.75 + 14.0  # gpt-5.2 = 1.75 in / 14.0 out per Mtok


def test_cost_from_usage_sums_multiple_models():
    usage = {
        "gpt-5.2": {"input_tokens": 1_000_000, "output_tokens": 0},
        "gpt-4o-mini": {"input_tokens": 0, "output_tokens": 1_000_000},
    }
    assert math.isclose(cost_from_usage(usage, MODEL_PRICING), 1.75 + 0.60)


def test_cost_from_usage_unknown_model_contributes_zero():
    assert cost_from_usage({"mystery": {"input_tokens": 5_000_000, "output_tokens": 0}}, MODEL_PRICING) == 0.0


def test_percentile_nearest_rank_and_empty():
    vals = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    assert percentile(vals, 50) == 50
    assert percentile(vals, 95) == 100
    assert percentile([], 50) is None


def test_derive_run_metrics_cost_and_per_determination():
    run = {"model": "gpt-5.2",
           "usage": {"gpt-5.2": {"input_tokens": 1_000_000, "output_tokens": 0}},
           "n_determinations": 4}
    m = derive_run_metrics(run, MODEL_PRICING)
    assert math.isclose(m["cost_usd"], 1.75)
    assert math.isclose(m["cost_per_determination_usd"], 1.75 / 4)


def test_derive_run_metrics_zero_determinations_is_none():
    run = {"model": "gpt-5.2", "usage": {"gpt-5.2": {"input_tokens": 0, "output_tokens": 0}}, "n_determinations": 0}
    assert derive_run_metrics(run, MODEL_PRICING)["cost_per_determination_usd"] is None


def test_aggregate_run_metrics_rolls_up_cost():
    run_metrics = [
        {"cost_usd": 1.0, "cost_per_determination_usd": 0.5},
        {"cost_usd": 3.0, "cost_per_determination_usd": 1.5},
    ]
    agg = aggregate_run_metrics(run_metrics)
    assert agg["n_runs"] == 2
    assert math.isclose(agg["total_cost_usd"], 4.0)
    assert math.isclose(agg["mean_cost_per_run_usd"], 2.0)
    # p50/p95 over the per-run cost_per_determination (nearest-rank)
    assert agg["cost_per_determination_p50_usd"] in (0.5, 1.5)
    assert agg["cost_per_determination_p95_usd"] == 1.5


def test_load_eval_output_reads_scores_runs_and_latency():
    data = load_eval_output(_FIXTURE)
    # per-evaluator average scores
    assert set(data["evaluators"]) >= {
        "determination_accuracy", "grounding_faithfulness", "expected_program_recall"
    }
    # at least one per-run record with the normalized usage + n_determinations
    assert data["runs"] and "usage" in data["runs"][0] and "n_determinations" in data["runs"][0]
    # the spawn_researchers tool latency block (seconds)
    assert data["spawn_latency"] is None or "avg_s" in data["spawn_latency"]


def test_load_eval_output_is_fail_soft_on_missing_dir(tmp_path):
    data = load_eval_output(tmp_path)  # empty dir -> no files
    assert data["evaluators"] == {} and data["runs"] == [] and data["spawn_latency"] is None


def test_build_and_render_scorecard_groups_primary_directional_and_cost():
    sc = build_scorecard(load_eval_output(_FIXTURE))
    md = render_scorecard_md(sc)
    # primary metrics present
    assert "expected_program_recall" in md and "grounding_faithfulness" in md
    # accuracy explicitly labeled directional
    assert "directional" in md.lower()
    # cost-per-determination headline present
    assert "determination" in md.lower() and ("cost" in md.lower())
