import research_agentic.policy as policy
from research_agentic.policy import _cap_text, _max_tool_chars


def test_under_limit_passthrough():
    assert _cap_text("short") == "short"


def test_non_string_passthrough():
    assert _cap_text(123) == 123
    assert _cap_text(None) is None


def test_over_limit_truncates_with_marker(monkeypatch):
    monkeypatch.setenv("RESEARCH_CORE_MAX_TOOL_CHARS", "1000")
    text = "x" * 5000
    out = _cap_text(text)
    assert len(out) < 5000
    assert out.startswith("x" * 1000)
    assert "truncated 4000 of 5000 characters" in out


def test_env_override_floor(monkeypatch):
    monkeypatch.setenv("RESEARCH_CORE_MAX_TOOL_CHARS", "50")  # below the 1000 floor
    assert _max_tool_chars() == 1000


def test_default_cap(monkeypatch):
    monkeypatch.delenv("RESEARCH_CORE_MAX_TOOL_CHARS", raising=False)
    assert _max_tool_chars() == 16000
