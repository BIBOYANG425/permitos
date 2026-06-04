import pathlib

import pytest

CFG = pathlib.Path(__file__).resolve().parents[1] / "research_agentic" / "configs" / "researcher.yml"


@pytest.mark.asyncio
async def test_researcher_workflow_loads_with_10_tools(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-used-offline")
    import research_agentic.register  # noqa: F401  (registers the 10 tools)
    from nat.runtime.loader import load_workflow

    async with load_workflow(str(CFG)) as session_manager:
        # The workflow built (llm + the tool_calling_agent with all 10 tools resolved).
        assert session_manager is not None
