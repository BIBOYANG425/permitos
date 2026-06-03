"""Fail-soft Supabase persistence for run-level metrics + eval scorecards.

The inverse of the pipeline's fail-LOUD core, exactly like observability.record_run:
durable telemetry that must NEVER raise, block, or slow a run/eval. Writes rows to
two PostgREST tables (research_runs, eval_scorecards) via stdlib urllib (no new dep).
If SUPABASE_URL / SUPABASE_SERVICE_KEY are unset, every call is a silent no-op.

Header last reviewed: 2026-06-02
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any

logger = logging.getLogger("research_aiq.persistence")

_URL_ENV = "SUPABASE_URL"
_KEY_ENV = "SUPABASE_SERVICE_KEY"
_TIMEOUT_SECONDS = 3.0


def build_run_row(run_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
    """Pure: map orchestrate's run metrics to a research_runs row."""
    return {
        "run_id": run_id,
        "model": metrics.get("model"),
        "status": metrics.get("status"),
        "n_determinations": metrics.get("n_determinations"),
        "n_verified": metrics.get("n_verified"),
        "n_needs_review": metrics.get("n_needs_review"),
        "n_investigated": metrics.get("n_investigated"),
        "n_invariant_violations": metrics.get("n_invariant_violations"),
    }


def build_scorecard_row(sidecar: dict[str, Any], model: str | None) -> dict[str, Any]:
    """Pure: map eval_report's scorecard sidecar dict to an eval_scorecards row."""
    primary = sidecar.get("evaluators_primary", {}) or {}
    directional = sidecar.get("evaluators_directional", {}) or {}
    agg = sidecar.get("aggregate", {}) or {}
    lat = sidecar.get("spawn_latency_ms") or {}
    return {
        "model": model,
        "n_runs": agg.get("n_runs"),
        "recall": primary.get("expected_program_recall"),
        "grounding": primary.get("grounding_faithfulness"),
        "accuracy": directional.get("determination_accuracy"),
        "total_cost_usd": agg.get("total_cost_usd"),
        "cost_per_determination_p50_usd": agg.get("cost_per_determination_p50_usd"),
        "cost_per_determination_p95_usd": agg.get("cost_per_determination_p95_usd"),
        "spawn_latency_avg_ms": lat.get("avg_ms"),
        "spawn_latency_p95_ms": lat.get("p95_ms"),
    }


def _post_row(table: str, row: dict[str, Any]) -> int:
    """POST one row to {SUPABASE_URL}/rest/v1/{table}. Raises on transport error;
    the public persist_* wrappers swallow. Returns HTTP status."""
    base = os.environ[_URL_ENV].rstrip("/")
    key = os.environ[_KEY_ENV]
    data = json.dumps(row).encode("utf-8")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    request = urllib.request.Request(  # noqa: S310 - fixed https supabase endpoint
        f"{base}/rest/v1/{table}", data=data, headers=headers, method="POST"
    )
    with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as resp:  # noqa: S310
        return int(resp.status)


def _persist(table: str, row: dict[str, Any], what: str) -> None:
    if not (os.environ.get(_URL_ENV) and os.environ.get(_KEY_ENV)):
        logger.debug("Supabase persistence skipped (%s/%s unset)", _URL_ENV, _KEY_ENV)
        return None
    try:
        status = _post_row(table, row)
        if not (200 <= status < 300):
            logger.warning("Supabase %s returned HTTP %s (ignored)", what, status)
    except Exception as exc:  # noqa: BLE001 - fail-soft is the whole contract
        logger.warning("Supabase %s failed (ignored): %s", what, exc)
    return None


def persist_run(run_id: str, metrics: dict[str, Any]) -> None:
    """Fail-soft: write a research_runs row. Never raises."""
    return _persist("research_runs", build_run_row(run_id, metrics), f"run {run_id}")


def persist_scorecard(sidecar: dict[str, Any], model: str | None) -> None:
    """Fail-soft: write an eval_scorecards row. Never raises."""
    return _persist("eval_scorecards", build_scorecard_row(sidecar, model), "scorecard")
