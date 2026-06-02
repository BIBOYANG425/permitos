"""Smoke test: TypedDict shapes are plain dicts — access fields with dict syntax."""

from research_core.types import Determination


def test_determination_dict_shape():
    d: Determination = {
        "requirement": "x",
        "applies": "needs_review",
        "trigger": "",
        "project_fact": "",
        "citation": "",
        "quote": "",
        "source_url": "",
        "confidence": 0.0,
        "verified": False,
        "review_flag": True,
    }
    assert d["applies"] == "needs_review"
