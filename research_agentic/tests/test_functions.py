import asyncio
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
    out = json.loads(asyncio.run(rt._web_fetch_impl("https://x.gov")))
    assert out["ok"] is False and out["error"]["code"] == "sandbox_required"


def test_tool_with_session_routes_to_run_tool(monkeypatch):
    captured = {}

    def fake_run_tool(session, tool, args):
        captured["tool"] = tool
        captured["args"] = args
        return {"ok": True, "status": "fetched", "text": "hi"}

    monkeypatch.setattr(rt, "run_tool", fake_run_tool)
    with use_sandbox_session(_FakeSession()):
        out = json.loads(asyncio.run(rt._web_fetch_impl("https://www.aqmd.gov/x")))
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


def test_all_impls_build_as_aiq_functions():
    # Guards the sync-vs-async regression: every impl must build as a nat FunctionInfo.
    from nat.builder.function_info import FunctionInfo
    for name in rt.TOOL_NAMES:
        fi = FunctionInfo.from_fn(rt._IMPLS[name], description="t")
        assert fi is not None


def test_tool_raises_on_sandbox_operational_error(monkeypatch):
    from research_agentic.sandbox import SandboxOperationalError
    def boom(session, tool, args):
        raise SandboxOperationalError("sandbox died")
    monkeypatch.setattr(rt, "run_tool", boom)
    with use_sandbox_session(_FakeSession()):
        with pytest.raises(SandboxOperationalError):
            asyncio.run(rt._web_fetch_impl("https://www.aqmd.gov/x"))


def test_submit_finding_non_dict_metadata_returns_structured_error():
    out = json.loads(asyncio.run(rt._submit_finding_impl("t", "s", ["https://x.gov"], 0.5, "[1,2]")))
    assert out["ok"] is False and out["error"]["code"] == "invalid_metadata_json"
