import math

from research_aiq.eval_report import (
    MODEL_PRICING,
    aggregate_run_metrics,
    cost_from_usage,
    derive_run_metrics,
    percentile,
)


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
