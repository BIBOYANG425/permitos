from pathlib import Path

from research_agentic.policy import SandboxPolicy
from research_agentic.sandbox_tools.browser import browser_use


def _policy(**kw) -> SandboxPolicy:
    return SandboxPolicy(run_id="r", artifact_root=Path("/tmp"), **kw)


def test_browser_disabled():
    out = browser_use(_policy(allow_browser=False), "https://www.aqmd.gov/x")
    assert out["ok"] is False and out["error"]["code"] == "browser_disabled"


def test_browser_ssrf_blocked():
    out = browser_use(_policy(), "http://127.0.0.1/x")
    assert out["ok"] is False and out["error"]["code"] == "host_not_fetchable"


def test_browser_dependency_missing_when_playwright_absent():
    # Host has no playwright -> dependency_missing (NOT a crash).
    out = browser_use(_policy(), "https://www.aqmd.gov/x")
    assert out["ok"] is False
    assert out["error"]["code"] in {"dependency_missing", "browser_failed"}
