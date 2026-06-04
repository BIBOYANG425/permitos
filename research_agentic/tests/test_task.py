import json

from research_agentic.task import ResearcherTask


def test_task_to_input_message_is_json_with_hypothesis():
    t = ResearcherTask(
        run_id="run-1",
        hypothesis="Does the graphic-arts operation qualify for a VCAPCD Rule 23 exemption?",
        skill_id="vcapcd-rule-23-exemption",
        facts={"county": "Ventura", "sic": "2759"},
        provided_documents=[{"name": "ink-sds", "type": "sds", "text": "VOC 50 wt%..."}],
    )
    msg = t.to_input_message()
    parsed = json.loads(msg)
    assert parsed["hypothesis"].startswith("Does the graphic-arts")
    assert parsed["skill_id"] == "vcapcd-rule-23-exemption"
    assert parsed["facts"]["county"] == "Ventura"
    assert parsed["provided_documents"][0]["type"] == "sds"


def test_task_minimal():
    t = ResearcherTask(run_id="r", hypothesis="H?")
    parsed = json.loads(t.to_input_message())
    assert parsed["hypothesis"] == "H?"
    assert parsed["facts"] == {} and parsed["provided_documents"] == []
