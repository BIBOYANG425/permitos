"""Unit tests for the `nat eval` evaluator SCORING logic (no network).

The live `nat eval` run is non-deterministic (a real agentic + Modal run); THESE are
the durable tests. Each feeds an evaluator a hand-built (workflow-output, gold) pair
and asserts the 0..1 score is exactly right: a perfect output scores 1.0, a degraded
output scores the expected fraction.

We exercise the evaluators' `evaluate_item(EvalInputItem) -> EvalOutputItem` directly
(that is the unit nat calls per item; `evaluate` just maps it over the dataset with
concurrency + averaging, which is nat's code, not ours). Fixtures mirror the REAL
research_core/research_aiq schemas:
  - workflow output: {"run_id", "determinations": [<Determination>], "status"}
  - Determination row: {requirement, applies, trigger, project_fact, citation, quote,
    source_url, confidence, verified, review_flag}
  - gold (dataset `answer`): {program_id: "applies"|"needs_review"}
  - EvidenceBundle (in STORE for grounding): {hypothesis_id, sources: [{url, quote}], ...}
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from nat.data_models.evaluator import EvalInputItem
from research_core.completeness import expected_programs_for_scope
from research_core.pipeline import finalize_run
from research_core.planner import plan_research

from research_aiq.evaluators import (
    DeterminationAccuracyEvaluator,
    ExpectedProgramRecallEvaluator,
    GroundingFaithfulnessEvaluator,
)
from research_aiq.run_store import STORE

_DATASET = Path(__file__).resolve().parents[1] / "research_aiq" / "eval" / "dataset.json"


# ---------------------------------------------------------------------------
# Scope fixtures (subset of eval/dataset.json) + their requirement labels.
# ---------------------------------------------------------------------------

# scope-grading-stormwater: expects exactly two programs (IGP + CGP). Small, so a
# determination_accuracy/recall fraction is easy to read (a half-wrong = 1/2).
SCOPE_STORMWATER = {
    "facility": {"jurisdiction_stack": ["Los Angeles RWQCB"], "naics": "237310", "sic": None},
    "project_change": {
        "description": "Grading 5 acres for a new pad; no equipment or chemicals.",
        "equipment": [],
        "chemicals": [],
        "waste_streams": [],
        "disturbance_acres": 5.0,
        "process_discharge": False,
    },
    "missing_facts": [],
    "assumptions": [],
}

# Requirement labels (from synthesis._requirement_for) for the stormwater programs.
REQ_CGP = "Construction stormwater permit coverage"  # ca-construction-general-permit
REQ_IGP = "California Industrial General Permit applicability"  # ca-industrial-general-permit


def _det(
    requirement: str, applies: str, *, verified: bool, quote: str = "", source_url: str = ""
) -> dict:
    """A determination row with the real shape. review_flag = not verified."""
    return {
        "requirement": requirement,
        "applies": applies,
        "trigger": "",
        "project_fact": "",
        "citation": "",
        "quote": quote,
        "source_url": source_url,
        "confidence": 0.9 if verified else 0.2,
        "verified": verified,
        "review_flag": not verified,
    }


def _output(determinations: list[dict], run_id: str = "eval-test") -> str:
    return json.dumps({"run_id": run_id, "determinations": determinations, "status": "complete"})


def _item(*, input_obj, expected_output_obj, output_obj) -> EvalInputItem:
    return EvalInputItem(
        id="t",
        input_obj=input_obj,
        expected_output_obj=expected_output_obj,
        output_obj=output_obj,
        full_dataset_entry={},
    )


def _run(evaluator, item) -> float:
    out = asyncio.run(evaluator.evaluate_item(item))
    return out.score


# ---------------------------------------------------------------------------
# determination_accuracy
# ---------------------------------------------------------------------------


# Gold uses the program-disposition vocab ("applies"/"needs_review"); a determination
# ROW uses ("yes"/"no"/"needs_review"). The evaluator normalizes the row vocab into the
# gold vocab (yes->applies, no->does_not_apply, needs_review->needs_review) before
# comparing, so a row that says "yes" matches gold "applies".
GOLD_STORMWATER = {
    "ca-construction-general-permit": "applies",
    "ca-industrial-general-permit": "needs_review",
}


def test_determination_accuracy_perfect_is_1():
    # CGP row "yes" -> normalizes to gold "applies"; IGP row "needs_review" -> matches.
    output = _output(
        [
            _det(REQ_CGP, "yes", verified=True),
            _det(REQ_IGP, "needs_review", verified=False),
        ]
    )
    item = _item(
        input_obj=json.dumps(SCOPE_STORMWATER),
        expected_output_obj=GOLD_STORMWATER,
        output_obj=output,
    )
    assert _run(DeterminationAccuracyEvaluator(), item) == 1.0


def test_determination_accuracy_half_wrong_is_one_half():
    # CGP "yes"->"applies" matches gold; IGP "yes"->"applies" is WRONG (gold needs_review).
    output = _output(
        [
            _det(REQ_CGP, "yes", verified=True),
            _det(REQ_IGP, "yes", verified=True),
        ]
    )
    item = _item(
        input_obj=json.dumps(SCOPE_STORMWATER),
        expected_output_obj=GOLD_STORMWATER,
        output_obj=output,
    )
    assert _run(DeterminationAccuracyEvaluator(), item) == 0.5


def test_determination_accuracy_missing_gold_program_scores_zero_for_it():
    # IGP is entirely ABSENT from the output -> predicted None != gold -> 0 for IGP.
    # CGP "yes"->"applies" matches -> 1/2.
    output = _output([_det(REQ_CGP, "yes", verified=True)])
    item = _item(
        input_obj=json.dumps(SCOPE_STORMWATER),
        expected_output_obj=GOLD_STORMWATER,
        output_obj=output,
    )
    assert _run(DeterminationAccuracyEvaluator(), item) == 0.5


def test_determination_accuracy_negated_does_not_match_applies():
    # A row that says "no" -> "does_not_apply" must NOT match gold "applies". CGP "no"
    # fails; IGP "needs_review" matches -> 1/2. Guards the vocab normalization.
    output = _output(
        [
            _det(REQ_CGP, "no", verified=True),
            _det(REQ_IGP, "needs_review", verified=False),
        ]
    )
    item = _item(
        input_obj=json.dumps(SCOPE_STORMWATER),
        expected_output_obj=GOLD_STORMWATER,
        output_obj=output,
    )
    assert _run(DeterminationAccuracyEvaluator(), item) == 0.5


# ---------------------------------------------------------------------------
# expected_program_recall
# ---------------------------------------------------------------------------


def test_expected_program_recall_full_is_1():
    # Both expected programs (CGP + IGP) appear -> 2/2.
    output = _output(
        [
            _det(REQ_CGP, "applies", verified=True),
            _det(REQ_IGP, "needs_review", verified=False),
        ]
    )
    item = _item(input_obj=json.dumps(SCOPE_STORMWATER), expected_output_obj={}, output_obj=output)
    assert _run(ExpectedProgramRecallEvaluator(), item) == 1.0


def test_expected_program_recall_partial_is_one_half():
    # Only CGP appears; IGP is absent -> 1/2.
    output = _output([_det(REQ_CGP, "applies", verified=True)])
    item = _item(input_obj=json.dumps(SCOPE_STORMWATER), expected_output_obj={}, output_obj=output)
    assert _run(ExpectedProgramRecallEvaluator(), item) == 0.5


# ---------------------------------------------------------------------------
# grounding_faithfulness  (reads gathered bundles from STORE by run_id)
# ---------------------------------------------------------------------------

_GROUNDED_QUOTE = (
    "A person shall not build, install, or operate any equipment that may emit "
    "air contaminants without a written Permit to Construct."
)
REQ_AIR_201 = "SCAQMD Permit to Construct/Operate review"  # _requirement_for("H-AIR-201")
URL_AIR_201 = "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf"


def _air_201_bundle() -> dict:
    """Bundle whose source quote CONTAINS the grounded determination's quote verbatim."""
    return {
        "hypothesis_id": "H-AIR-201",
        "sources": [
            {"url": URL_AIR_201, "source_name": "SCAQMD Rule 201", "quote": _GROUNDED_QUOTE}
        ],
        "extracted_claims": [],
        "researcher_conclusion": "applies",
        "uncertainties": [],
    }


def _seed_store(run_id: str, bundles: list[dict]) -> None:
    STORE.init(run_id, SCOPE_STORMWATER, [], [])
    STORE.add_bundles(run_id, bundles)


def test_grounding_faithfulness_grounded_verified_is_1():
    run_id = "ground-ok"
    _seed_store(run_id, [_air_201_bundle()])
    # One verified determination whose quote IS verbatim-present in its source bundle.
    output = _output(
        [_det(REQ_AIR_201, "yes", verified=True, quote=_GROUNDED_QUOTE, source_url=URL_AIR_201)],
        run_id=run_id,
    )
    item = _item(input_obj=json.dumps(SCOPE_STORMWATER), expected_output_obj={}, output_obj=output)
    assert _run(GroundingFaithfulnessEvaluator(), item) == 1.0


def test_grounding_faithfulness_ungrounded_verified_is_one_half():
    run_id = "ground-half"
    _seed_store(run_id, [_air_201_bundle()])
    # Two verified rows: one grounded (quote in source), one whose quote appears in NO
    # source bundle -> grounded 1 / verified 2 = 0.5.
    output = _output(
        [
            _det(REQ_AIR_201, "yes", verified=True, quote=_GROUNDED_QUOTE, source_url=URL_AIR_201),
            _det(
                REQ_IGP,
                "yes",
                verified=True,
                quote="This sentence appears in no cited source whatsoever.",
                source_url="https://example.invalid/nope",
            ),
        ],
        run_id=run_id,
    )
    item = _item(input_obj=json.dumps(SCOPE_STORMWATER), expected_output_obj={}, output_obj=output)
    assert _run(GroundingFaithfulnessEvaluator(), item) == 0.5


def test_grounding_faithfulness_no_verified_is_1_vacuously():
    run_id = "ground-none"
    _seed_store(run_id, [])
    # No verified determinations -> faithfulness is vacuously 1.0 (no ungrounded claim).
    output = _output([_det(REQ_IGP, "needs_review", verified=False)], run_id=run_id)
    item = _item(input_obj=json.dumps(SCOPE_STORMWATER), expected_output_obj={}, output_obj=output)
    assert _run(GroundingFaithfulnessEvaluator(), item) == 1.0


# ---------------------------------------------------------------------------
# Dataset well-formedness — guards eval/dataset.json against malformed scopes /
# gold drift WITHOUT any network. (A bad waste-stream shape once crashed
# plan_research only at live-eval time; this catches that class of defect offline.)
# ---------------------------------------------------------------------------


def test_dataset_scopes_drive_the_deterministic_pipeline():
    """Every dataset scope must be a valid ScopePack: plan_research + finalize_run
    (with no evidence) must run clean. This is the cheap pre-flight the live eval
    relies on — a malformed scope must fail HERE, not after spending Modal budget."""
    dataset = json.loads(_DATASET.read_text())
    assert len(dataset) == 12
    for item in dataset:
        scope = json.loads(item["question"])  # question is a SCOPE JSON string
        plan = plan_research(scope, [])
        pruned = {**plan, "research_graph": [], "research_tasks": []}
        result = finalize_run(item["id"], scope, pruned, [], [], [])
        # With zero evidence the recall floor must still surface every expected program.
        assert len(result["determinations"]) >= len(expected_programs_for_scope(scope))


def test_dataset_gold_keys_are_expected_programs():
    """Every gold program id must be an expected program for its scope (the mechanical
    which-programs axis from research_core), so gold can never name a program the recall
    floor would not surface."""
    dataset = json.loads(_DATASET.read_text())
    for item in dataset:
        scope = json.loads(item["question"])
        expected_ids = {p["id"] for p in expected_programs_for_scope(scope)}
        gold_ids = set(item["answer"])
        assert gold_ids, f"{item['id']} has empty gold"
        assert gold_ids <= expected_ids, (
            f"{item['id']}: gold names non-expected {gold_ids - expected_ids}"
        )
        # Gold dispositions are constrained to the curated vocab.
        assert set(item["answer"].values()) <= {"applies", "needs_review"}
