import json
from pathlib import Path

from research_agentic.policy import SandboxPolicy
from research_agentic.sandbox_runtime import dispatch, main


def _policy(tmp_path: Path) -> SandboxPolicy:
    return SandboxPolicy(run_id="run-1", artifact_root=tmp_path)


def test_dispatch_compute(tmp_path):
    out = dispatch("compute_voc_threshold",
                   {"voc_content": 6.8, "voc_content_unit": "lb/gal", "mass_limit_lb": 200.0},
                   _policy(tmp_path))
    assert out["ok"] is True and out["usage_limit"]["gal"] == 29.41


def test_dispatch_unknown_tool(tmp_path):
    out = dispatch("nope", {}, _policy(tmp_path))
    assert out["ok"] is False and out["error"]["code"] == "unknown_tool"


def test_dispatch_read_skill(tmp_path):
    out = dispatch("read_skill", {"skill_id": "vcapcd-rule-23-exemption"}, _policy(tmp_path))
    assert out["ok"] is True


def test_dispatch_write_then_read_artifact(tmp_path):
    pol = _policy(tmp_path)
    w = dispatch("write_artifact", {"relative_path": "n.txt", "contents": "hi"}, pol)
    assert w["ok"] is True
    r = dispatch("read_spreadsheet", {"path": "n.txt"}, pol)  # wrong type -> structured error, no raise
    assert r["ok"] is False


def test_dispatch_catches_body_exception(tmp_path, monkeypatch):
    import research_agentic.sandbox_runtime as rt
    def boom(policy, **kw):
        raise RuntimeError("kaboom")
    monkeypatch.setitem(rt._TOOLS, "web_fetch", lambda policy, args: boom(policy))
    out = dispatch("web_fetch", {"url": "https://x.gov"}, _policy(tmp_path))
    assert out["ok"] is False and out["error"]["code"] == "tool_call_failed"


def test_main_non_dict_args(capsys, tmp_path, monkeypatch):
    monkeypatch.setenv("ARTIFACT_ROOT", str(tmp_path))
    rc = main(["sandbox_runtime", "web_search", "[1,2]"])
    out = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert out["ok"] is False
    assert out["error"]["code"] == "bad_args_json"


def test_main_bad_timeout_env(capsys, tmp_path, monkeypatch):
    monkeypatch.setenv("ARTIFACT_ROOT", str(tmp_path))
    monkeypatch.setenv("RESEARCH_SANDBOX_TIMEOUT", "not-a-float")
    rc = main(["sandbox_runtime", "compute_voc_threshold",
               '{"voc_content": 6.8, "voc_content_unit": "lb/gal", "mass_limit_lb": 200.0}'])
    out = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert out["ok"] is True
