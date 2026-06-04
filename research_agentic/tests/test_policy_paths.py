from pathlib import Path

import pytest

from research_agentic.policy import (
    SandboxPolicy,
    _error,
    _invalid_argument,
    _resolve_workspace_path,
    _safe_run_workspace,
    _success,
)


def _policy(tmp_path: Path) -> SandboxPolicy:
    return SandboxPolicy(run_id="run-123", artifact_root=tmp_path)


def test_success_and_error_shapes():
    assert _success("done", x=1) == {"ok": True, "status": "done", "x": 1}
    err = _error("blocked", "nope", "no good", url="u")
    assert err == {"ok": False, "status": "blocked", "error": {"code": "nope", "message": "no good"}, "url": "u"}
    bad = _invalid_argument("url", "a string", 5)
    assert bad["ok"] is False and bad["error"]["code"] == "invalid_argument" and bad["received_type"] == "int"


def test_safe_run_workspace_is_under_root(tmp_path):
    ws = _safe_run_workspace(_policy(tmp_path))
    assert ws == (tmp_path / "run-123").resolve()


def test_resolve_workspace_path_allows_relative(tmp_path):
    p = _resolve_workspace_path(_policy(tmp_path), "findings/a.json")
    assert p == (tmp_path / "run-123" / "findings" / "a.json").resolve()


def test_resolve_workspace_path_rejects_wrong_type(tmp_path):
    with pytest.raises(TypeError):
        _resolve_workspace_path(_policy(tmp_path), 42)  # type: ignore[arg-type]


def test_resolve_workspace_path_blocks_absolute(tmp_path):
    with pytest.raises(ValueError):
        _resolve_workspace_path(_policy(tmp_path), "/etc/passwd")


def test_resolve_workspace_path_blocks_traversal(tmp_path):
    with pytest.raises(ValueError):
        _resolve_workspace_path(_policy(tmp_path), "../../escape.txt")
