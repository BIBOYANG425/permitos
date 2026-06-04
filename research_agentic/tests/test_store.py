import json

import pytest

from research_agentic.store import RunArtifacts, collect_run


class _FakeProc:
    def __init__(self, out, code=0):
        self._out, self._code = out, code

    class _S:
        def __init__(self, s): self._s = s
        def read(self): return self._s

    @property
    def stdout(self): return self._S(self._out)
    @property
    def stderr(self): return self._S("")
    def wait(self): return self._code


class _FakeSandbox:
    def __init__(self, proc):
        self._proc = proc

    def exec(self, *a, **k):
        self.last = a
        return self._proc


class _FakeSession:
    def __init__(self, proc):
        self.sandbox = _FakeSandbox(proc)
        self.run_id = "run-1"


def test_collect_run_parses_findings_and_trace():
    payload = json.dumps({"ok": True, "run_id": "run-1",
                          "findings": [{"title": "Rule 23 applies", "sources": ["https://x.gov"]}],
                          "trace": [{"tool": "web_fetch", "ok": True, "url": "https://x.gov"}],
                          "artifacts": ["notes/a.txt"]})
    arts = collect_run(_FakeSession(_FakeProc(payload)))
    assert isinstance(arts, RunArtifacts)
    assert arts.findings[0]["title"] == "Rule 23 applies"
    assert arts.trace[0]["tool"] == "web_fetch"
    assert arts.artifacts == ["notes/a.txt"]


def test_collect_run_raises_on_sandbox_failure():
    from research_agentic.sandbox import SandboxOperationalError
    with pytest.raises(SandboxOperationalError):
        collect_run(_FakeSession(_FakeProc("not json", code=0)))
