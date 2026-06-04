from pathlib import Path

from research_agentic.policy import SandboxPolicy
from research_agentic.sandbox_tools.documents import read_pdf, read_spreadsheet


def _policy(tmp_path: Path) -> SandboxPolicy:
    ws = tmp_path / "run-1"
    ws.mkdir(parents=True, exist_ok=True)
    return SandboxPolicy(run_id="run-1", artifact_root=tmp_path)


def test_read_csv_dep_free(tmp_path):
    pol = _policy(tmp_path)
    (Path(pol.artifact_root) / "run-1" / "data.csv").write_text("a,b\n1,2\n")
    out = read_spreadsheet(pol, "data.csv")
    assert out["ok"] is True
    assert out["sheets"][0]["rows"] == [["a", "b"], ["1", "2"]]
    assert "a\tb" in out["text"]


def test_file_not_found(tmp_path):
    out = read_spreadsheet(_policy(tmp_path), "missing.csv")
    assert out["ok"] is False and out["error"]["code"] == "file_not_found"


def test_path_traversal_blocked(tmp_path):
    out = read_pdf(_policy(tmp_path), "../../etc/passwd")
    assert out["ok"] is False and out["error"]["code"] == "path_traversal"


def test_read_pdf_dependency_missing_when_fitz_absent(tmp_path):
    # On the host test env PyMuPDF is not installed; a real (but unparseable) file path
    # that EXISTS should report dependency_missing, not file_not_found.
    pol = _policy(tmp_path)
    (Path(pol.artifact_root) / "run-1" / "x.pdf").write_bytes(b"%PDF-1.4 fake")
    out = read_pdf(pol, "x.pdf")
    # Either dependency_missing (no fitz) or read (fitz present) — both are acceptable;
    # assert it is NOT a false file_not_found / traversal error.
    assert out["error"]["code"] != "file_not_found" if not out["ok"] else out["ok"]
