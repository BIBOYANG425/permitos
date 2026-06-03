"""Focused optimizer: compare orchestration models via the slice-1 eval/scorecard
and recommend the cost-optimal one that still holds the recall/grounding floors.

AIQ has no native model/prompt optimizer (nat sizing is GPU-cluster sizing,
irrelevant to our OpenAI+Modal setup), so this is a custom eval-driven comparison.
recall + grounding are mechanism-constant (~1.0 for every model — the recall floor
and verifier guarantee them), so the real differentiator is COST + grounding depth
(directional accuracy). This module's comparison/recommendation logic is pure +
unit-tested; the live runner (added in the next task) drives `nat eval` per model.

Header last reviewed: 2026-06-02
"""
from __future__ import annotations

CANDIDATE_MODELS = ["gpt-5.2", "gpt-5.5", "gpt-4o-mini"]
# A small representative subset of dataset ids keeps the live comparison bounded.
DEFAULT_SUBSET = [
    "scope-scaqmd-coating-booth",
    "scope-grading-stormwater",
    "scope-wastewater-pretreatment",
]


def _row_from_result(result: dict) -> dict:
    sc = result["scorecard"]
    primary = sc.get("evaluators_primary", {}) or {}
    directional = sc.get("evaluators_directional", {}) or {}
    agg = sc.get("aggregate", {}) or {}
    return {
        "model": result["model"],
        "recall": primary.get("expected_program_recall"),
        "grounding": primary.get("grounding_faithfulness"),
        "accuracy": directional.get("determination_accuracy"),
        "total_cost_usd": agg.get("total_cost_usd"),
        "cost_per_determination_p50_usd": agg.get("cost_per_determination_p50_usd"),
    }


def build_comparison(results: list[dict]) -> list[dict]:
    """One comparison row per model result (preserves input order)."""
    return [_row_from_result(r) for r in results]


def recommend_cost_optimal(
    results: list[dict], recall_floor: float = 1.0, grounding_floor: float = 1.0
) -> str | None:
    """Cheapest model (by total_cost_usd) whose recall & grounding meet the floors.
    Tiebreak on higher directional accuracy (grounding depth). None if none qualify."""
    rows = build_comparison(results)
    eligible = [
        r for r in rows
        if (r["recall"] or 0) >= recall_floor and (r["grounding"] or 0) >= grounding_floor
    ]
    if not eligible:
        return None
    eligible.sort(
        key=lambda r: (r.get("total_cost_usd") or float("inf"), -(r.get("accuracy") or 0))
    )
    return eligible[0]["model"]
