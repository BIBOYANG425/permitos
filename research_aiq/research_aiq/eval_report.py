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

import json
import math
from dataclasses import dataclass, field
from pathlib import Path

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
    cpd = [
        m["cost_per_determination_usd"]
        for m in run_metrics
        if m.get("cost_per_determination_usd") is not None
    ]
    return {
        "n_runs": len(run_metrics),
        "total_cost_usd": sum(costs),
        "mean_cost_per_run_usd": (sum(costs) / len(costs)) if costs else None,
        "cost_per_determination_p50_usd": percentile(cpd, 50),
        "cost_per_determination_p95_usd": percentile(cpd, 95),
    }


# --------------------------------------------------------------------------- #
# Output-dir ADAPTER: read nat's REAL files -> the normalized contract above.   #
# Every read is FAIL-SOFT: a missing file/key skips that piece, never raises.   #
# --------------------------------------------------------------------------- #

# expected_program_recall + grounding_faithfulness are the rigorous benchmark.
PRIMARY = ["expected_program_recall", "grounding_faithfulness"]
# determination_accuracy is DIRECTIONAL only (dispositions are curated, not gold).
DIRECTIONAL = ["determination_accuracy"]
# The Modal fan-out tool whose latency the profiler tracks.
_SPAWN_KEY = "TOOL:spawn_researchers"


def _read_json(path: Path):
    """Load JSON or return None (missing/empty/malformed file -> fail-soft)."""
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _evaluator_scores(output_dir: Path) -> dict[str, float]:
    """{name: average_score} from each `<name>_output.json`; skip missing/malformed."""
    scores: dict[str, float] = {}
    for name in PRIMARY + DIRECTIONAL:
        doc = _read_json(output_dir / f"{name}_output.json")
        if isinstance(doc, dict) and isinstance(doc.get("average_score"), (int, float)):
            scores[name] = float(doc["average_score"])
    return scores


def _run_records(output_dir: Path) -> list[dict]:
    """Per-run {model, usage, n_determinations} from `workflow_output_atif.json`.

    nat's ATIF stores the orchestration model at trajectory.agent.model_name and
    per-run tokens at trajectory.final_metrics.{total_prompt_tokens,
    total_completion_tokens} (mapped to input_tokens/output_tokens). n_determinations
    is len(json.loads(output_obj)["determinations"]). Items missing any needed field
    are skipped rather than crashing the whole load.
    """
    items = _read_json(output_dir / "workflow_output_atif.json")
    if not isinstance(items, list):
        return []
    runs: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        traj = item.get("trajectory")
        if not isinstance(traj, dict):
            continue
        agent = traj.get("agent") or {}
        model = agent.get("model_name")
        fm = traj.get("final_metrics") or {}
        prompt_toks = fm.get("total_prompt_tokens")
        completion_toks = fm.get("total_completion_tokens")
        if not model or prompt_toks is None or completion_toks is None:
            continue

        # output_obj is a JSON STRING -> {run_id, determinations, status}
        n_det = 0
        oo = item.get("output_obj")
        if isinstance(oo, str):
            try:
                parsed = json.loads(oo)
            except ValueError:
                parsed = None
        else:
            parsed = oo
        if isinstance(parsed, dict) and isinstance(parsed.get("determinations"), list):
            n_det = len(parsed["determinations"])

        runs.append(
            {
                "model": model,
                "usage": {
                    model: {
                        "input_tokens": int(prompt_toks),
                        "output_tokens": int(completion_toks),
                    }
                },
                "n_determinations": n_det,
            }
        )
    return runs


def _spawn_latency(output_dir: Path) -> dict | None:
    """Modal fan-out latency from the profiler's simple_stack_analysis (SECONDS).

    Returns {avg_s, p95_s, usage_count} for the spawn_researchers tool, or None if
    the profiler file or that tool's block is absent.
    """
    doc = _read_json(output_dir / "workflow_profiling_metrics.json")
    if not isinstance(doc, dict):
        return None
    analysis = doc.get("simple_stack_analysis")
    if not isinstance(analysis, dict):
        return None
    block = analysis.get(_SPAWN_KEY)
    if not isinstance(block, dict):
        return None
    avg = block.get("avg_duration")
    p95 = block.get("p95_duration")
    if avg is None and p95 is None:
        return None
    return {
        "avg_s": float(avg) if avg is not None else None,
        "p95_s": float(p95) if p95 is not None else None,
        "usage_count": int(block.get("usage_count", 0) or 0),
    }


def load_eval_output(output_dir) -> dict:
    """Read a `nat eval` output dir into the normalized contract.

    Returns {evaluators: {name: average_score}, runs: [{model, usage,
    n_determinations}], spawn_latency: {avg_s, p95_s, usage_count} | None}.
    Fully fail-soft: a missing dir or any missing/malformed file yields empties.
    """
    d = Path(output_dir)
    return {
        "evaluators": _evaluator_scores(d),
        "runs": _run_records(d),
        "spawn_latency": _spawn_latency(d),
    }


# --------------------------------------------------------------------------- #
# Scorecard: group metrics + roll up cost/latency for rendering.               #
# --------------------------------------------------------------------------- #


@dataclass
class Scorecard:
    """Grouped + rolled-up view of one eval run, ready to render."""

    evaluators_primary: dict[str, float] = field(default_factory=dict)
    evaluators_directional: dict[str, float] = field(default_factory=dict)
    run_metrics: list[dict] = field(default_factory=list)
    aggregate: dict = field(default_factory=dict)
    # Modal fan-out latency converted to MS for display (or None).
    spawn_latency_ms: dict | None = None
    researchers_per_run: float | None = None
    unpriced_models: list[str] = field(default_factory=list)


def build_scorecard(data: dict, pricing: dict = MODEL_PRICING) -> Scorecard:
    """Split evaluators into primary/directional, derive+aggregate per-run cost,
    convert spawn latency to ms, and surface any unpriced models."""
    evaluators = data.get("evaluators", {}) or {}
    primary = {k: evaluators[k] for k in PRIMARY if k in evaluators}
    directional = {k: evaluators[k] for k in DIRECTIONAL if k in evaluators}

    runs = data.get("runs", []) or []
    run_metrics = [derive_run_metrics(r, pricing) for r in runs]
    aggregate = aggregate_run_metrics(run_metrics)

    spawn = data.get("spawn_latency")
    spawn_ms = None
    researchers_per_run = None
    if spawn:
        avg_s = spawn.get("avg_s")
        p95_s = spawn.get("p95_s")
        spawn_ms = {
            "avg_ms": (avg_s * 1000) if avg_s is not None else None,
            "p95_ms": (p95_s * 1000) if p95_s is not None else None,
            "usage_count": spawn.get("usage_count", 0),
        }
        n_runs = aggregate.get("n_runs", 0)
        if n_runs:
            researchers_per_run = spawn.get("usage_count", 0) / n_runs

    # Models that appear in any run's usage but have no entry in the price map.
    unpriced: list[str] = []
    for r in runs:
        for model in r.get("usage") or {}:
            if model not in pricing and model not in unpriced:
                unpriced.append(model)

    return Scorecard(
        evaluators_primary=primary,
        evaluators_directional=directional,
        run_metrics=run_metrics,
        aggregate=aggregate,
        spawn_latency_ms=spawn_ms,
        researchers_per_run=researchers_per_run,
        unpriced_models=unpriced,
    )


# --------------------------------------------------------------------------- #
# Markdown renderer.                                                            #
# --------------------------------------------------------------------------- #


def _fmt(value, prefix: str = "", suffix: str = "", places: int = 4) -> str:
    """Format a number with prefix/suffix, or 'n/a' for None (fail-soft display)."""
    if value is None:
        return "n/a"
    return f"{prefix}{value:.{places}f}{suffix}"


def render_scorecard_md(
    sc: Scorecard,
    *,
    date: str = "<date>",
    model: str = "<model>",
) -> str:
    """Render the scorecard as committed Markdown. Uses the profiler's avg + p95
    (it emits no p50 — we report avg & p95 honestly and never fabricate a p50)."""
    agg = sc.aggregate or {}
    n_runs = agg.get("n_runs", 0)

    lines: list[str] = []
    lines.append("# Eval scorecard")
    lines.append("")
    lines.append(f"- Date: {date}")
    lines.append(f"- Orchestration model: {model}")
    lines.append(f"- Runs (items x reps): {n_runs}")
    lines.append("")

    lines.append("## Primary metrics (rigorous)")
    lines.append("")
    if sc.evaluators_primary:
        for name in PRIMARY:
            if name in sc.evaluators_primary:
                lines.append(f"- {name}: {_fmt(sc.evaluators_primary[name], places=3)}")
    else:
        lines.append("- (no primary evaluator output found)")
    lines.append("")

    lines.append("## Directional metric (not a rigorous benchmark)")
    lines.append("")
    lines.append(
        "These dispositions are curated, not gold, so accuracy is **directional** "
        "only — read it as a trend, not a benchmark."
    )
    lines.append("")
    if sc.evaluators_directional:
        for name in DIRECTIONAL:
            if name in sc.evaluators_directional:
                lines.append(f"- {name}: {_fmt(sc.evaluators_directional[name], places=3)}")
    else:
        lines.append("- (no directional evaluator output found)")
    lines.append("")

    lines.append(
        "## Cost (derived; orchestration LLM only — Modal researcher LLM cost is separate)"
    )
    lines.append("")
    lines.append(f"- Total cost: {_fmt(agg.get('total_cost_usd'), prefix='$')}")
    lines.append(f"- Mean cost / run: {_fmt(agg.get('mean_cost_per_run_usd'), prefix='$')}")
    lines.append(
        "- Cost per determination (p50): "
        f"{_fmt(agg.get('cost_per_determination_p50_usd'), prefix='$')}"
    )
    lines.append(
        "- Cost per determination (p95): "
        f"{_fmt(agg.get('cost_per_determination_p95_usd'), prefix='$')}"
    )
    lines.append("")

    lines.append("## Latency")
    lines.append("")
    lines.append("spawn_researchers (Modal fan-out). The profiler emits avg & p95 (no p50).")
    lines.append("")
    if sc.spawn_latency_ms:
        lines.append(
            f"- spawn_researchers avg: {_fmt(sc.spawn_latency_ms.get('avg_ms'), suffix=' ms', places=1)}"
        )
        lines.append(
            f"- spawn_researchers p95: {_fmt(sc.spawn_latency_ms.get('p95_ms'), suffix=' ms', places=1)}"
        )
        lines.append(f"- Researchers / run: {_fmt(sc.researchers_per_run, places=2)}")
    else:
        lines.append("- (no profiler latency for spawn_researchers found)")
    lines.append("")

    if sc.unpriced_models:
        lines.append("## Note")
        lines.append("")
        lines.append(
            "Unpriced models (no entry in MODEL_PRICING; contributed $0 to cost): "
            + ", ".join(sc.unpriced_models)
        )
        lines.append("")

    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# CLI: output dir -> scorecard.md + JSON sidecar.                              #
# --------------------------------------------------------------------------- #


def main(output_dir, out_md, out_json) -> None:
    """Read a nat eval output dir; write a Markdown scorecard + a JSON sidecar."""
    data = load_eval_output(output_dir)
    sc = build_scorecard(data)

    md = render_scorecard_md(sc)
    Path(out_md).write_text(md)

    sidecar = {
        "evaluators_primary": sc.evaluators_primary,
        "evaluators_directional": sc.evaluators_directional,
        "aggregate": sc.aggregate,
        "run_metrics": sc.run_metrics,
        "spawn_latency_ms": sc.spawn_latency_ms,
        "researchers_per_run": sc.researchers_per_run,
        "unpriced_models": sc.unpriced_models,
    }
    Path(out_json).write_text(json.dumps(sidecar, indent=2))


if __name__ == "__main__":
    import sys

    main(sys.argv[1], sys.argv[2], sys.argv[3])
