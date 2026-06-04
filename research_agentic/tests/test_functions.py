import json

import pytest

from research_agentic.functions import researcher_tools as rt
from research_agentic.sandbox import use_sandbox_session


class _FakeSession:
    def __init__(self):
        self.calls = []
        self.run_id = "run-1"

    # run_tool is monkeypatched, so the sandbox attribute is unused here.


def test_tool_without_session_returns_structured_error():
    out = json.loads(rt._web_fetch_impl("https://x.gov"))
    assert out["ok"] is False and out["error"]["code"] == "sandbox_required"


def test_tool_with_session_routes_to_run_tool(monkeypatch):
    captured = {}

    def fake_run_tool(session, tool, args):
        captured["tool"] = tool
        captured["args"] = args
        return {"ok": True, "status": "fetched", "text": "hi"}

    monkeypatch.setattr(rt, "run_tool", fake_run_tool)
    with use_sandbox_session(_FakeSession()):
        out = json.loads(rt._web_fetch_impl("https://www.aqmd.gov/x"))
    assert out["ok"] is True
    assert captured["tool"] == "web_fetch"
    assert captured["args"] == {"url": "https://www.aqmd.gov/x"}


def test_all_ten_tools_registered():
    # register.py import must succeed and define 10 builders.
    import research_agentic.register  # noqa: F401
    assert len(rt.TOOL_NAMES) == 10
    assert set(rt.TOOL_NAMES) == {
        "read_skill", "web_search", "web_fetch", "browser_use", "read_pdf",
        "read_docx", "read_spreadsheet", "compute_voc_threshold", "write_artifact", "submit_finding",
    }
