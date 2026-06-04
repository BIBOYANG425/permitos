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
