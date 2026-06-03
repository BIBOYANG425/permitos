"""Post-process a `nat eval` output dir into derived headline metrics + a committed
scorecard. THIS file's pure functions (below) do the math over a normalized contract
and are unit-tested in isolation; a later task adds the output-dir ADAPTER that reads
nat's real files (ATIF trajectory.final_metrics for per-run prompt/completion tokens +
model, the profiler's simple_stack_analysis for Modal tool latency, and the per-
evaluator average_score) and maps them into these shapes.

Dollar cost is derived from token counts x an in-repo per-model price map (explicit +
updatable, not a live API). The profiler/ATIF capture the ORCHESTRATION LLM only; Modal
researcher LLM usage runs out-of-process and is out of scope for these cost figures.

Header last reviewed: 2026-06-02
"""
from __future__ import annotations

import math

# $ per 1M tokens (input, output). Update as pricing changes.
MODEL_PRICING: dict[str, dict[str, float]] = {
    "gpt-5.5": {"input": 5.0, "output": 30.0},
    "gpt-5.2": {"input": 1.75, "output": 14.0},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "o4-mini": {"input": 1.1, "output": 4.4},
}


def cost_from_usage(usage: dict[str, dict[str, int]], pricing: dict) -> float:
    """Sum $ over per-model normalized token usage. Unknown models contribute 0
    (the caller surfaces them as 'unpriced')."""
    total = 0.0
    for model, toks in usage.items():
        price = pricing.get(model)
        if not price:
            continue
        total += toks.get("input_tokens", 0) / 1_000_000 * price["input"]
        total += toks.get("output_tokens", 0) / 1_000_000 * price["output"]
    return total


def percentile(values: list[float], p: float) -> float | None:
    """Nearest-rank percentile; None for empty input (fail-soft)."""
    if not values:
        return None
    s = sorted(values)
    k = max(1, math.ceil(p / 100 * len(s)))
    return s[k - 1]


def derive_run_metrics(run: dict, pricing: dict = MODEL_PRICING) -> dict:
    """Per-run derived metrics from extracted primitives
    (run = {model, usage, n_determinations})."""
    cost = cost_from_usage(run.get("usage", {}), pricing)
    n_det = run.get("n_determinations", 0) or 0
    return {
        "model": run.get("model"),
        "cost_usd": cost,
        "n_determinations": n_det,
        "cost_per_determination_usd": (cost / n_det) if n_det else None,
    }


def aggregate_run_metrics(run_metrics: list[dict]) -> dict:
    """Roll up per-run metrics across all runs (items x reps)."""
    costs = [m["cost_usd"] for m in run_metrics]
    cpd = [m["cost_per_determination_usd"] for m in run_metrics
           if m.get("cost_per_determination_usd") is not None]
    return {
        "n_runs": len(run_metrics),
        "total_cost_usd": sum(costs),
        "mean_cost_per_run_usd": (sum(costs) / len(costs)) if costs else None,
        "cost_per_determination_p50_usd": percentile(cpd, 50),
        "cost_per_determination_p95_usd": percentile(cpd, 95),
    }
