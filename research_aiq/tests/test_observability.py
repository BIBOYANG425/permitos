"""Tests for research_aiq.observability — Raindrop run-level telemetry.

The contract under test is FAIL-SOFT: record_run must NEVER raise, whatever the
state of Raindrop. These tests assert that (a) it returns None silently when the
debugger env var is unset, (b) it returns None when pointed at a dead port (no
exception escapes), and (c) the payload it WOULD send carries the run_id and the
run metrics in the wire shape the Raindrop local debugger expects.

No test here touches the real network on the happy path — (b) deliberately targets
a closed port to exercise the degradation branch without a live server. The live
2xx path is covered by the smoke step in the task, not by this unit suite.
"""

from __future__ import annotations

import logging

from research_aiq import observability
from research_aiq.observability import build_payload, record_run

_ENV_VAR = observability._LOCAL_DEBUGGER_ENV_VAR


# ---------------------------------------------------------------------------
# build_payload — the wire shape (pure, no network)
# ---------------------------------------------------------------------------


def test_build_payload_includes_run_id_and_metrics():
    metrics = {
        "status": "needs_review",
        "determinations_count": 7,
        "verified_count": 4,
        "needs_review_count": 2,
        "investigated_count": 5,
        "model": "gpt-5.5",
        "recall_floor_missing": 1,
    }
    payload = build_payload("run-abc", metrics)

    # Raindrop keys the interaction by event_id == run_id.
    assert payload["event_id"] == "run-abc"
    assert payload["event"] == observability._EVENT_NAME
    assert payload["user_id"] == observability._USER_ID
    # Terminal interaction so the debugger flushes immediately.
    assert payload["is_pending"] is False
    # ai_data must carry at least one of input/output (SDK schema refine).
    assert payload["ai_data"]["input"] == "run-abc"
    assert payload["ai_data"]["output"] == "needs_review"
    assert payload["ai_data"]["model"] == "gpt-5.5"
    # Every metric the run handed us is preserved verbatim under properties.
    assert payload["properties"] == metrics
    assert payload["properties"]["determinations_count"] == 7
    assert payload["properties"]["verified_count"] == 4
    # Timestamp is present and ISO-8601-ish.
    assert "T" in payload["timestamp"]


def test_build_payload_defaults_output_when_status_missing():
    """ai_data.output must be non-empty even if the run omits 'status' (the SDK
    rejects an AI event with neither input nor output)."""
    payload = build_payload("run-no-status", {"determinations_count": 0})
    assert payload["ai_data"]["output"] == "completed"
    # input is always the run_id, so the refine is satisfied regardless.
    assert payload["ai_data"]["input"] == "run-no-status"


def test_build_payload_does_not_mutate_caller_metrics():
    metrics = {"status": "done"}
    build_payload("run-x", metrics)
    assert metrics == {"status": "done"}  # properties is a copy, not the original


# ---------------------------------------------------------------------------
# record_run — FAIL-SOFT (the non-negotiable contract)
# ---------------------------------------------------------------------------


def test_record_run_returns_none_when_env_unset(monkeypatch, caplog):
    """No RAINDROP_LOCAL_DEBUGGER -> silent no-op, no exception, no WARNING."""
    monkeypatch.delenv(_ENV_VAR, raising=False)
    with caplog.at_level(logging.WARNING, logger="research_aiq.observability"):
        result = record_run("run-unset", {"status": "done"})
    assert result is None
    # Unconfigured is the common prod case — must NOT warn.
    assert caplog.records == []


def test_record_run_fail_soft_against_closed_port(monkeypatch, caplog):
    """Debugger 'down' (closed port) -> returns None, logs ONE warning, no raise."""
    monkeypatch.setenv(_ENV_VAR, "http://localhost:1/v1/")
    with caplog.at_level(logging.WARNING, logger="research_aiq.observability"):
        result = record_run("run-closed", {"status": "done", "determinations_count": 3})
    assert result is None
    # Graceful degradation is observable as exactly one logged warning.
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "run-closed" in warnings[0].getMessage()


def test_record_run_swallows_unexpected_errors(monkeypatch):
    """Even a non-network bug inside the post path must not escape record_run."""
    monkeypatch.setenv(_ENV_VAR, "http://localhost:5899/v1/")

    def _boom(*_args, **_kwargs):
        raise RuntimeError("unexpected internal failure")

    # Force the POST helper to blow up in a non-URLError way.
    monkeypatch.setattr(observability, "_post", _boom)
    assert record_run("run-boom", {"status": "done"}) is None


def test_record_run_handles_garbage_endpoint(monkeypatch):
    """A malformed endpoint URL must degrade, not raise."""
    monkeypatch.setenv(_ENV_VAR, "not-a-valid-url")
    assert record_run("run-garbage", {"status": "done"}) is None


def test_record_run_2xx_path_with_stubbed_post(monkeypatch, caplog):
    """Happy path (stubbed transport): a 2xx logs DEBUG, not WARNING, and the
    payload passed to the transport carries run_id + metrics."""
    monkeypatch.setenv(_ENV_VAR, "http://localhost:5899/v1/")
    captured: dict = {}

    def _ok(base_url, payload):
        captured["base_url"] = base_url
        captured["payload"] = payload
        return 200

    monkeypatch.setattr(observability, "_post", _ok)
    with caplog.at_level(logging.WARNING, logger="research_aiq.observability"):
        result = record_run("run-ok", {"status": "done", "verified_count": 9})
    assert result is None
    assert captured["payload"]["event_id"] == "run-ok"
    assert captured["payload"]["properties"]["verified_count"] == 9
    # A successful send must not warn.
    assert [r for r in caplog.records if r.levelno == logging.WARNING] == []


def test_record_run_non_2xx_logs_warning(monkeypatch, caplog):
    """A reachable debugger that rejects the event (e.g. 400) is logged, not raised."""
    monkeypatch.setenv(_ENV_VAR, "http://localhost:5899/v1/")
    monkeypatch.setattr(observability, "_post", lambda *_a, **_k: 400)
    with caplog.at_level(logging.WARNING, logger="research_aiq.observability"):
        assert record_run("run-400", {"status": "done"}) is None
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "400" in warnings[0].getMessage()
