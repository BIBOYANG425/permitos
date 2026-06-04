import json
from pathlib import Path

from research_agentic.policy import SandboxPolicy
from research_agentic.sandbox_tools.artifacts import submit_finding, write_artifact


def _policy(tmp_path: Path) -> SandboxPolicy:
    return SandboxPolicy(run_id="run-1", artifact_root=tmp_path)


def test_write_artifact_within_workspace(tmp_path):
    out = write_artifact(_policy(tmp_path), "notes/a.txt", "hello")
    assert out["ok"] is True
    assert out["bytes_written"] == 5
    assert Path(out["path"]).read_text() == "hello"


def test_write_artifact_blocks_traversal(tmp_path):
    out = write_artifact(_policy(tmp_path), "../escape.txt", "x")
    assert out["ok"] is False and out["error"]["code"] == "path_traversal"


def test_submit_finding_writes_json(tmp_path):
    out = submit_finding(
        _policy(tmp_path),
        title="Rule 23 exemption applies",
        summary="Under 200 lb ROC/yr.",
        sources=["https://www.vcapcd.org/RULE23.pdf"],
        confidence=0.8,
    )
    assert out["ok"] is True
    finding = json.loads(Path(out["artifact_path"]).read_text())
    assert finding["title"] == "Rule 23 exemption applies"
    assert finding["sources"] == ["https://www.vcapcd.org/RULE23.pdf"]


def test_submit_finding_rejects_ssrf_source(tmp_path):
    out = submit_finding(_policy(tmp_path), title="t", summary="s",
                         sources=["http://169.254.169.254/latest"], confidence=0.5)
    assert out["ok"] is False and out["error"]["code"] == "host_not_allowed"


def test_submit_finding_validates_confidence(tmp_path):
    out = submit_finding(_policy(tmp_path), title="t", summary="s", sources=[], confidence=2.0)
    assert out["ok"] is False and out["error"]["code"] == "invalid_confidence"
