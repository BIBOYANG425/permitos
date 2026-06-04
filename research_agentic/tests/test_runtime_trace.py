import json
from pathlib import Path

from research_agentic.policy import SandboxPolicy
from research_agentic.sandbox_runtime import collect_workspace, dispatch


def _policy(tmp_path: Path) -> SandboxPolicy:
    return SandboxPolicy(run_id="run-1", artifact_root=tmp_path)


def test_dispatch_appends_trace(tmp_path):
    pol = _policy(tmp_path)
    (Path(pol.artifact_root) / pol.run_id).mkdir(parents=True, exist_ok=True)
    dispatch("compute_voc_threshold",
             {"voc_content": 6.8, "voc_content_unit": "lb/gal", "mass_limit_lb": 200.0}, pol)
    trace = (Path(pol.artifact_root) / pol.run_id / "trace.jsonl").read_text().splitlines()
    rec = json.loads(trace[-1])
    assert rec["tool"] == "compute_voc_threshold" and rec["ok"] is True


def test_collect_workspace_returns_findings_and_trace(tmp_path):
    pol = _policy(tmp_path)
    (Path(pol.artifact_root) / pol.run_id).mkdir(parents=True, exist_ok=True)
    dispatch("submit_finding",
             {"title": "Rule 23 applies", "summary": "Under 200 lb ROC/yr.",
              "sources": ["https://www.vcapcd.org/RULE23.pdf"], "confidence": 0.8}, pol)
    out = collect_workspace(pol)
    assert out["ok"] is True
    assert len(out["findings"]) == 1
    assert out["findings"][0]["title"] == "Rule 23 applies"
    assert any(r["tool"] == "submit_finding" for r in out["trace"])


def test_dispatch_records_failed_call(tmp_path, monkeypatch):
    import research_agentic.sandbox_runtime as rt
    pol = _policy(tmp_path)
    (Path(pol.artifact_root) / pol.run_id).mkdir(parents=True, exist_ok=True)
    def boom(p, a):
        raise RuntimeError("boom")
    monkeypatch.setitem(rt._TOOLS, "web_fetch", boom)
    result = dispatch("web_fetch", {"url": "https://x.gov"}, pol)
    assert result["ok"] is False and result["error"]["code"] == "tool_call_failed"
    last = json.loads((Path(pol.artifact_root) / pol.run_id / "trace.jsonl").read_text().splitlines()[-1])
    assert last["ok"] is False and last["tool"] == "web_fetch"


def test_collect_workspace_write_artifact_is_artifact_not_finding(tmp_path):
    pol = _policy(tmp_path)
    (Path(pol.artifact_root) / pol.run_id).mkdir(parents=True, exist_ok=True)
    dispatch("write_artifact", {"relative_path": "notes/a.txt", "contents": "hi"}, pol)
    out = collect_workspace(pol)
    assert "notes/a.txt" in out["artifacts"]
    assert out["findings"] == []
    wa = [r for r in out["trace"] if r["tool"] == "write_artifact"][-1]
    assert wa.get("path", "").endswith("notes/a.txt")  # Fix 2: write_artifact path captured


def test_trace_record_captures_browser_snapshot():
    from research_agentic.sandbox_runtime import _trace_record
    rec = _trace_record("browser_use", {"url": "https://x.gov"},
                        {"ok": True, "status": "navigated",
                         "snapshot": {"url": "https://www.vcapcd.org/r.pdf", "status_code": 200, "text": "RULE 23 body"}})
    assert rec["tool"] == "browser_use" and rec["ok"] is True
    assert rec["url"] == "https://www.vcapcd.org/r.pdf"
    assert rec["status_code"] == 200
    assert "text_sha256" in rec and rec["text_len"] == len("RULE 23 body")
