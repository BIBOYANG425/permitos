def test_build_sandbox_image_returns_image():
    import modal

    from research_agentic.sandbox import build_sandbox_image

    image = build_sandbox_image()
    assert isinstance(image, modal.Image)


import json

import pytest

from research_agentic.sandbox import (
    SandboxOperationalError,
    current_sandbox_session,
    run_tool,
    use_sandbox_session,
)


class _FakeProc:
    def __init__(self, out="", err="", code=0):
        self._out, self._err, self._code = out, err, code

    class _Stream:
        def __init__(self, s):
            self._s = s

        def read(self):
            return self._s

    @property
    def stdout(self):
        return self._Stream(self._out)

    @property
    def stderr(self):
        return self._Stream(self._err)

    def wait(self):
        return self._code


class _FakeSandbox:
    def __init__(self, proc):
        self._proc = proc
        self.terminated = False

    def exec(self, *args, **kwargs):
        self.last_args = args
        return self._proc

    def terminate(self):
        self.terminated = True


class _FakeSession:
    def __init__(self, proc):
        self.sandbox = _FakeSandbox(proc)
        self.run_id = "run-1"


def test_run_tool_parses_ok_json():
    sess = _FakeSession(_FakeProc(out=json.dumps({"ok": True, "status": "fetched", "text": "hi"})))
    out = run_tool(sess, "web_fetch", {"url": "https://x.gov"})
    assert out["ok"] is True and out["text"] == "hi"
    # The dispatcher was invoked as a module with tool + json args.
    assert sess.sandbox.last_args[:3] == ("python", "-m", "research_agentic.sandbox_runtime")
    assert sess.sandbox.last_args[3] == "web_fetch"
    assert json.loads(sess.sandbox.last_args[4]) == {"url": "https://x.gov"}


def test_run_tool_returns_structured_tool_error():
    sess = _FakeSession(_FakeProc(out=json.dumps({"ok": False, "status": "blocked", "error": {"code": "host_not_fetchable", "message": "no"}})))
    out = run_tool(sess, "web_fetch", {"url": "http://127.0.0.1"})
    assert out["ok"] is False and out["error"]["code"] == "host_not_fetchable"


def test_run_tool_nonzero_exit_raises():
    sess = _FakeSession(_FakeProc(out="", err="Traceback...", code=1))
    with pytest.raises(SandboxOperationalError):
        run_tool(sess, "web_fetch", {"url": "https://x.gov"})


def test_run_tool_unparseable_stdout_raises():
    sess = _FakeSession(_FakeProc(out="not json at all", code=0))
    with pytest.raises(SandboxOperationalError):
        run_tool(sess, "web_fetch", {"url": "https://x.gov"})


def test_contextvar_set_and_get():
    sess = _FakeSession(_FakeProc(out="{}"))
    assert current_sandbox_session() is None
    with use_sandbox_session(sess):
        assert current_sandbox_session() is sess
    assert current_sandbox_session() is None
