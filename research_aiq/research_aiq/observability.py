"""Run-level Raindrop observability for the AIQ research workflow — FAIL-SOFT.

This is the deliberate inverse of the pipeline's fail-LOUD core. A determination
run is legally consequential, so the pipeline raises on any integrity problem; but
observability is supplementary telemetry, so it must NEVER raise, block, or slow a
run. `record_run` swallows every error (Raindrop down, debugger off, bad payload,
network timeout) and logs at most one WARNING. The run always proceeds.

Why a hand-rolled HTTP client (no SDK)
--------------------------------------
Raindrop ships only a Node package (`raindrop-ai`); there is NO Python SDK
(confirmed: `pip show raindrop` / `raindrop-ai` both empty). The TypeScript app
(src/lib/research/run.ts) records a run-level interaction via the Node SDK's
`raindrop.begin(...).finish(...)`. Under the hood that SDK (read from
node_modules/raindrop-ai/dist/index.js) accumulates a partial AI event and POSTs a
single JSON object to `{RAINDROP_LOCAL_DEBUGGER}events/track_partial` (see
`mirrorPartialEventToLocalDebugger` -> `postJson(`${baseUrl}events/track_partial`)`
and `_flushPartialEventInternal`, which builds the `{event_id, user_id, timestamp,
event, ai_data, properties, is_pending}` shape). The local Workshop debugger
defaults to RAINDROP_LOCAL_DEBUGGER=http://localhost:5899/v1/.

We replicate that exact wire shape from Python with a one-shot POST. `record_run`
is called once at end-of-run with the final metrics, so we emit a single terminal
event with `is_pending: false` (the SDK's begin+finish collapsed — there is no
intermediate state to stream from a synchronous post-run hook).

NOTE: This module is intentionally NOT an AIQ component and is NOT registered in
register.py. It is a plain function the run wiring calls directly (Task 13).

Header last reviewed: 2026-06-02
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("research_aiq.observability")

# Env var the Raindrop Node SDK reads for the local Workshop debugger base URL.
# Same name on purpose so Python and TS share one .env.local knob.
_LOCAL_DEBUGGER_ENV_VAR = "RAINDROP_LOCAL_DEBUGGER"
# Optional auth — only set when shipping to the cloud API; the local debugger
# accepts unauthenticated POSTs. The SDK reads RAINDROP_WRITE_KEY for the Bearer.
_WRITE_KEY_ENV_VAR = "RAINDROP_WRITE_KEY"

# The interaction "event" name + the synthetic user the run is attributed to.
# Mirrors run.ts (event: "permit_research_run", userId: "permitpilot-demo").
_EVENT_NAME = "permit_research_run"
_USER_ID = "permitpilot-aiq"

# Path the SDK POSTs a single accumulated interaction to (relative to the base URL,
# which already ends in `/v1/`). Confirmed against raindrop-ai dist/index.js.
_TRACK_PARTIAL_PATH = "events/track_partial"

# Keep the POST snappy — telemetry must never stall a run. Short timeout; on
# timeout we degrade gracefully like every other failure.
_TIMEOUT_SECONDS = 3.0


def _format_base_url(raw: str) -> str:
    """Match the SDK's `formatEndpoint`: ensure exactly one trailing slash so
    `f"{base}{path}"` concatenation lands on `.../v1/events/track_partial`."""
    return raw if raw.endswith("/") else f"{raw}/"


def build_payload(run_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
    """Build the Raindrop AI track event for a finished run.

    Pure (no I/O) so the unit test can assert the wire shape without a network.
    Shape mirrors the Node SDK's flushed partial event: a terminal interaction
    (`is_pending: False`) carrying the run id, the canonical event name, an
    `ai_data` block, and the run metrics as flat `properties`.

    `metrics` is recorded verbatim under `properties` (status, #determinations,
    #verified/#needs_review/#investigated, model, verifier/recall-floor
    annotations, ...). We do not prescribe its keys — the run wiring owns them —
    we only guarantee run_id + the metrics land in the payload Raindrop sees.
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    # `ai_data` must carry at least one of input/output (SDK AiDataSchema refine).
    # The run's headline status is the natural "output" of the interaction.
    output = str(metrics.get("status", "completed"))
    return {
        "event_id": run_id,
        "user_id": _USER_ID,
        "event": _EVENT_NAME,
        "timestamp": timestamp,
        "ai_data": {
            "model": metrics.get("model"),
            "input": run_id,
            "output": output,
        },
        "properties": dict(metrics),
        # Terminal record: tells the debugger this interaction is complete, so it
        # flushes immediately instead of waiting on the partial-event timer.
        "is_pending": False,
    }


def _endpoint(base_url: str) -> str:
    return f"{_format_base_url(base_url)}{_TRACK_PARTIAL_PATH}"


def _post(base_url: str, payload: dict[str, Any]) -> int:
    """POST one event to the local debugger. Returns the HTTP status code.

    Isolated + tiny so the fail-soft wrapper has one obvious thing to guard, and
    so a test could in principle stub it. Raises on any transport error — the
    PUBLIC entrypoint (`record_run`) is what swallows; this helper stays honest.
    """
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    write_key = os.environ.get(_WRITE_KEY_ENV_VAR)
    if write_key:
        headers["Authorization"] = f"Bearer {write_key}"
    request = urllib.request.Request(  # noqa: S310 - fixed http(s) local endpoint
        _endpoint(base_url), data=data, headers=headers, method="POST"
    )
    with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:  # noqa: S310
        return int(response.status)


def record_run(run_id: str, metrics: dict[str, Any]) -> None:
    """Emit a run-level Raindrop interaction. FAIL-SOFT: never raises.

    Mirrors src/lib/research/run.ts: one interaction per run, keyed by run_id,
    carrying the run's metrics. If RAINDROP_LOCAL_DEBUGGER is unset, or the
    Workshop debugger is down, or the POST errors/times out, we log a single
    WARNING and return None. Observability failure must not affect a run.
    """
    base_url: Optional[str] = os.environ.get(_LOCAL_DEBUGGER_ENV_VAR)
    if not base_url:
        # Not configured — silent by design (the common prod/CI case). DEBUG, not
        # WARNING, so a deployment that simply doesn't run Workshop isn't noisy.
        logger.debug("Raindrop observability skipped: %s not set", _LOCAL_DEBUGGER_ENV_VAR)
        return None

    try:
        payload = build_payload(run_id, metrics)
        status = _post(base_url, payload)
        if 200 <= status < 300:
            logger.debug("Recorded run %s to Raindrop (HTTP %s)", run_id, status)
        else:
            logger.warning(
                "Raindrop observability for run %s returned HTTP %s (ignored)",
                run_id,
                status,
            )
    except (urllib.error.URLError, OSError, TimeoutError, ValueError) as exc:
        # Debugger down / unreachable / bad payload — degrade gracefully.
        logger.warning(
            "Raindrop observability failed for run %s (ignored): %s",
            run_id,
            exc,
        )
    except Exception as exc:  # noqa: BLE001 - fail-soft is the whole contract
        # Absolute backstop: NOTHING from telemetry may escape into the run.
        logger.warning(
            "Raindrop observability raised unexpectedly for run %s (ignored): %s",
            run_id,
            exc,
        )
    return None
