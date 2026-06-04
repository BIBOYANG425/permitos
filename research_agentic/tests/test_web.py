import httpx

from research_agentic.policy import SandboxPolicy
from research_agentic.sandbox_tools import web
from research_agentic.sandbox_tools.web import web_fetch


def _policy() -> SandboxPolicy:
    from pathlib import Path
    return SandboxPolicy(run_id="r", artifact_root=Path("/tmp"))


class _Resp:
    def __init__(self, status=200, headers=None, text="", content=b"", url="https://www.aqmd.gov/x"):
        self.status_code = status
        self.headers = headers or {"content-type": "text/plain"}
        self.text = text
        self.content = content
        self.url = url

    @property
    def is_success(self):
        return 200 <= self.status_code < 300


class _FakeClient:
    """Stand-in for httpx.Client: returns a queued response per .get() call."""
    def __init__(self, responses, **kwargs):
        self._responses = list(responses)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get(self, url, params=None):
        return self._responses.pop(0)


def _patch_client(monkeypatch, responses):
    monkeypatch.setattr(httpx, "Client", lambda **kw: _FakeClient(responses))


def test_web_fetch_plain_text(monkeypatch):
    _patch_client(monkeypatch, [_Resp(text="Rule 201 requires a Permit to Construct.")])
    out = web_fetch(_policy(), "https://www.aqmd.gov/rule-201")
    assert out["ok"] is True
    assert "Permit to Construct" in out["text"]
    assert out["status_code"] == 200


def test_web_fetch_blocks_ssrf():
    out = web_fetch(_policy(), "http://169.254.169.254/latest/meta-data")
    assert out["ok"] is False and out["error"]["code"] == "host_not_fetchable"


def test_web_fetch_network_disabled():
    from pathlib import Path
    pol = SandboxPolicy(run_id="r", artifact_root=Path("/tmp"), allow_network=False)
    out = web_fetch(pol, "https://www.aqmd.gov/x")
    assert out["ok"] is False and out["error"]["code"] == "network_disabled"


def test_web_fetch_redirect_to_private_blocked(monkeypatch):
    redirect = _Resp(status=302, headers={"location": "http://10.0.0.1/secret", "content-type": "text/html"})
    _patch_client(monkeypatch, [redirect])
    out = web_fetch(_policy(), "https://www.aqmd.gov/go")
    assert out["ok"] is False and out["error"]["code"] == "redirect_blocked"


def test_web_fetch_pdf_magic_bytes_without_fitz_falls_through(monkeypatch):
    # %PDF magic but no PyMuPDF on host -> _extract_pdf_text returns None -> text path.
    pdf = _Resp(headers={"content-type": "application/pdf"}, content=b"%PDF-1.4 ...", text="")
    _patch_client(monkeypatch, [pdf])
    out = web_fetch(_policy(), "https://www.aqmd.gov/rule.pdf")
    assert out["ok"] is True
    assert out.get("extracted_format") != "pdf"  # fell through (no fitz on host)


def test_web_search_unavailable_without_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    out = web.web_search(_policy(), "graphic arts permit ventura county")
    assert out["ok"] is False
    assert out["error"]["code"] in {"search_provider_unavailable", "search_dependency_missing"}
