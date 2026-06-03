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

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from research_aiq.eval_report import build_scorecard, load_eval_output
from research_aiq.persistence import persist_scorecard

_PKG = Path(__file__).resolve().parent  # research_aiq/research_aiq
_DATASET = _PKG / "eval" / "dataset.json"
_CONFIG = _PKG / "configs" / "eval_config.yml"

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
        r
        for r in rows
        if (r["recall"] or 0) >= recall_floor and (r["grounding"] or 0) >= grounding_floor
    ]
    if not eligible:
        return None
    eligible.sort(
        key=lambda r: (r.get("total_cost_usd") or float("inf"), -(r.get("accuracy") or 0))
    )
    return eligible[0]["model"]


def _subset_dataset(subset_ids: list[str], dest: str) -> None:
    data = json.loads(_DATASET.read_text())
    chosen = [d for d in data if d["id"] in subset_ids]
    Path(dest).write_text(json.dumps(chosen))


def run_comparison(models=None, subset=None, reps=1) -> list[dict]:
    """For each model: run `nat eval` over the subset with OPENAI_ORCHESTRATION_MODEL
    set, build its scorecard, persist it (fail-soft), and collect {model, scorecard}.
    Live + costly (models x subset x reps agentic runs); offline/manual."""
    models = models or CANDIDATE_MODELS
    subset = subset or DEFAULT_SUBSET
    pkg_dir = _PKG.parents[0]  # the outer research_aiq package dir (cwd for nat eval)
    results: list[dict] = []
    with tempfile.TemporaryDirectory() as tmp:
        ds = f"{tmp}/subset.json"
        _subset_dataset(subset, ds)
        for model in models:
            env = {
                **os.environ,
                "OPENAI_ORCHESTRATION_MODEL": model,
                "PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION": "python",
                "PYTHONPATH": f"{pkg_dir}:{pkg_dir.parent}/research_core",
            }
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "nat.cli.main",
                    "eval",
                    "--config_file",
                    str(_CONFIG),
                    "--dataset",
                    ds,
                    "--reps",
                    str(reps),
                ],
                cwd=str(pkg_dir),
                env=env,
                check=True,
            )
            sc = build_scorecard(load_eval_output(pkg_dir / ".tmp/nat/research_aiq_eval"))
            sidecar = {
                "evaluators_primary": sc.evaluators_primary,
                "evaluators_directional": sc.evaluators_directional,
                "aggregate": sc.aggregate,
                "spawn_latency_ms": sc.spawn_latency_ms,
            }
            persist_scorecard(sidecar, model)
            results.append({"model": model, "scorecard": sidecar})
    return results


def render_report_md(results: list[dict], recommendation: str | None) -> str:
    rows = build_comparison(results)
    lines = [
        "# Optimizer — orchestration model comparison",
        "",
        "recall + grounding are mechanism-constant (~1.0 every model); the "
        "differentiator is cost + grounding depth (directional accuracy).",
        "",
        "| model | recall | grounding | accuracy | total $ | $/determination (p50) |",
        "|---|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(
            f"| {r['model']} | {r['recall']} | {r['grounding']} | {r['accuracy']} "
            f"| {r['total_cost_usd']} | {r['cost_per_determination_p50_usd']} |"
        )
    lines += [
        "",
        f"**Cost-optimal (holds recall=grounding=1.0): {recommendation or 'none'}**",
        "",
    ]
    return "\n".join(lines)


def main(out_md: str, out_json: str) -> None:
    results = run_comparison()
    rec = recommend_cost_optimal(results)
    Path(out_md).write_text(render_report_md(results, rec))
    Path(out_json).write_text(
        json.dumps({"comparison": build_comparison(results), "recommendation": rec}, indent=2)
    )


if __name__ == "__main__":
    main(*sys.argv[1:])
