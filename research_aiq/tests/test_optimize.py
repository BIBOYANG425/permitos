"""Unit tests for the optimizer's PURE comparison + recommendation logic (no I/O).

The live per-model `nat eval` runner is non-deterministic and lives in a later task;
THESE durable tests pin the offline decision logic. Each "result" is a
{"model", "scorecard"} pair where the scorecard mirrors eval_report.to_sidecar's
shape (evaluators_primary / evaluators_directional / aggregate). We assert the
comparison emits one row per model in order, and that the recommendation picks the
cheapest model still holding the recall + grounding floors (None when none qualify).
"""

from research_aiq.optimize import build_comparison, recommend_cost_optimal


def _result(model, recall, grounding, accuracy, total_cost, cpd_p50):
    return {"model": model, "scorecard": {
        "evaluators_primary": {"expected_program_recall": recall, "grounding_faithfulness": grounding},
        "evaluators_directional": {"determination_accuracy": accuracy},
        "aggregate": {"total_cost_usd": total_cost, "cost_per_determination_p50_usd": cpd_p50},
    }}


def test_build_comparison_one_row_per_model():
    results = [_result("gpt-5.2", 1.0, 1.0, 0.62, 0.15, 0.002),
               _result("gpt-5.5", 1.0, 1.0, 0.70, 0.55, 0.007)]
    rows = build_comparison(results)
    assert [r["model"] for r in rows] == ["gpt-5.2", "gpt-5.5"]
    assert rows[0]["total_cost_usd"] == 0.15 and rows[0]["accuracy"] == 0.62


def test_recommend_picks_cheapest_meeting_floors():
    results = [_result("gpt-5.2", 1.0, 1.0, 0.62, 0.15, 0.002),
               _result("gpt-5.5", 1.0, 1.0, 0.70, 0.55, 0.007)]
    assert recommend_cost_optimal(results) == "gpt-5.2"  # both meet floors → cheaper wins


def test_recommend_excludes_models_below_floor():
    results = [_result("cheapo", 1.0, 0.5, 0.40, 0.02, 0.0003),   # grounding below floor
               _result("gpt-5.2", 1.0, 1.0, 0.62, 0.15, 0.002)]
    assert recommend_cost_optimal(results) == "gpt-5.2"


def test_recommend_none_when_no_model_meets_floors():
    results = [_result("cheapo", 0.8, 0.5, 0.4, 0.02, 0.0003)]
    assert recommend_cost_optimal(results) is None
