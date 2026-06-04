from research_agentic.sandbox_tools.skills import read_skill


def test_read_existing_skill():
    out = read_skill("vcapcd-rule-23-exemption")
    assert out["ok"] is True
    assert out["skill_id"] == "vcapcd-rule-23-exemption"
    assert len(out["content"]) > 0


def test_missing_skill_returns_error():
    out = read_skill("no-such-skill")
    assert out["ok"] is False and out["error"]["code"] == "skill_not_found"


def test_empty_skill_id():
    out = read_skill("")
    assert out["ok"] is False and out["error"]["code"] == "skill_not_found"


def test_traversal_blocked():
    out = read_skill("../../../etc/passwd")
    assert out["ok"] is False and out["error"]["code"] in {"skill_not_found", "invalid_skill_id"}
