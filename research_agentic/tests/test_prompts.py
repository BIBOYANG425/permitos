from research_agentic.prompts import RESEARCHER_SYSTEM_PROMPT


def test_prompt_covers_the_loop():
    p = RESEARCHER_SYSTEM_PROMPT.lower()
    # The researcher must be told the discovery loop + the terminal tool + grounding discipline.
    for needle in ["read_skill", "web_fetch", "compute_voc_threshold", "submit_finding",
                   "verbatim", "primary", "untrusted"]:
        assert needle in p, f"system prompt missing: {needle}"
    assert len(RESEARCHER_SYSTEM_PROMPT) > 400


def test_prompt_marks_submit_finding_terminal():
    assert "submit_finding" in RESEARCHER_SYSTEM_PROMPT
    assert "once" in RESEARCHER_SYSTEM_PROMPT.lower()
