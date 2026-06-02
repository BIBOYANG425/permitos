from research_aiq.prompts import ORCHESTRATION_SYSTEM_PROMPT


def test_prompt_mentions_tool_contract_and_backstop():
    assert isinstance(ORCHESTRATION_SYSTEM_PROMPT, str)
    assert ORCHESTRATION_SYSTEM_PROMPT.strip()
    assert "spawn_researchers" in ORCHESTRATION_SYSTEM_PROMPT
    assert "submit_plan" in ORCHESTRATION_SYSTEM_PROMPT
    assert "recall floor" in ORCHESTRATION_SYSTEM_PROMPT
    # the legally-consequential default must survive the port
    assert "needs_review" in ORCHESTRATION_SYSTEM_PROMPT
