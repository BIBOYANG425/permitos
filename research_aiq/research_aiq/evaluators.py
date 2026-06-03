"""Custom `nat eval` evaluators for the agentic research workflow (Task 12).

This is the eval-first half of the tier's observability story: a small, offline,
SAMPLED quality harness that scores the live agentic run against a gold dataset.
It is distinct from invariants.py — invariants are the cheap always-on hard checks
that run on EVERY finished run; these evaluators run only under `nat eval`, over the
`eval/dataset.json` items, and produce graded 0..1 scores nat aggregates (mean across
items x reps) into a scorecard alongside the profiler's cost/latency.

nat's evaluator interface (confirmed against the installed nvidia-nat 1.7.0)
-----------------------------------------------------------------------------
An evaluator is registered with `@register_evaluator(config_type=Cfg)` decorating an
async-generator builder `async def build(cfg, builder) -> EvaluatorInfo`. The builder
yields an `EvaluatorInfo(config=cfg, evaluate_fn=<callable>, description=...)`. nat
calls `evaluate_fn(EvalInput) -> EvalOutput`. We get the concurrency, per-item
error-isolation, and average aggregation for free by subclassing
`nat.plugins.eval.evaluator.base_evaluator.BaseEvaluator` and implementing
`evaluate_item(item: EvalInputItem) -> EvalOutputItem`.

Per item nat hands us an `EvalInputItem` with:
  - `input_obj`            -> the workflow input  == our SCOPE JSON string
  - `expected_output_obj`  -> the dataset `answer` == gold per-program label map
  - `output_obj`           -> the workflow output  == determinations JSON string
                              {"run_id", "determinations": [...], "status"}
  - `id`, `trajectory`, `full_dataset_entry` (unused here)
We return an `EvalOutputItem(id, score in [0,1], reasoning=<dict>, error=None)`.

The three evaluators
--------------------
PRIMARY (rigorous benchmark) — expected_program_recall + grounding_faithfulness.
Both score against a deterministic ground truth (the program registry x scope
derivation, and the verbatim quote present in the gathered bundle), so they are the
metrics the scorecard reports as a real benchmark.

DIRECTIONAL (not a rigorous benchmark) — determination_accuracy. By design there is
no rigorous disposition gold: the gold dispositions are CURATED (hand-labeled), not a
canonical ground truth, so accuracy is a useful trend signal only and the scorecard
labels it directional.

  expected_program_recall: [PRIMARY] fraction of expected_programs_for_scope(scope)
                           that APPEAR in the determinations. REUSES the recall-floor
                           coverage logic (invariants._program_present_labels) — the
                           same registry x scope derivation finalize's recall floor
                           uses.
  grounding_faithfulness : [PRIMARY] fraction of VERIFIED determinations whose verbatim
                           quote is actually present in its gathered source bundle.
                           REUSES invariants.determination_is_grounded. The bundles are
                           read from the run-scoped STORE by the run_id in the output
                           (the live path); 1.0 when nothing is verified.
  determination_accuracy : [DIRECTIONAL] predicted vs gold disposition per gold program;
                           score = fraction matching (a gold program missing from the
                           output scores 0 for that program). Gold dispositions are
                           curated, so this is directional only — not a rigorous
                           disposition benchmark.

Header last reviewed: 2026-06-02
"""

from __future__ import annotations

import json
import logging
from typing import Any

from nat.builder.builder import EvalBuilder
from nat.builder.evaluator import EvaluatorInfo
from nat.cli.register_workflow import register_evaluator
from nat.data_models.evaluator import EvalInputItem
from nat.data_models.evaluator import EvaluatorBaseConfig
from nat.plugins.eval.data_models.evaluator_io import EvalOutputItem
from nat.plugins.eval.evaluator.base_evaluator import BaseEvaluator
from research_core.completeness import expected_programs_for_scope

from research_aiq.invariants import (
    _program_present_labels,
    determination_is_grounded,
    index_bundles_by_hypothesis,
)
from research_aiq.run_store import STORE

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared parsing helpers
# ---------------------------------------------------------------------------


def _parse_scope(input_obj: Any) -> dict:
    """The workflow input is a SCOPE JSON string; tolerate an already-parsed dict."""
    if isinstance(input_obj, dict):
        return input_obj
    return json.loads(input_obj)


def _parse_output(output_obj: Any) -> dict:
    """The workflow output is a determinations JSON string
    {"run_id", "determinations", "status"}; tolerate an already-parsed dict."""
    if isinstance(output_obj, dict):
        return output_obj
    if output_obj is None:
        return {}
    return json.loads(output_obj)


def _parse_gold(expected_output_obj: Any) -> dict[str, str]:
    """The dataset `answer` is a {program_id: disposition} map. pandas/json hands it
    over as a dict already; tolerate a JSON string too."""
    if isinstance(expected_output_obj, dict):
        return expected_output_obj
    if expected_output_obj in (None, ""):
        return {}
    return json.loads(expected_output_obj)


# Map a determination row's `applies` vocab -> the gold label vocab.
# A row uses ("yes" | "no" | "needs_review"); gold uses the program-disposition
# vocab ("applies" | "does_not_apply" | "needs_review"). The dataset's gold only ever
# contains "applies"/"needs_review" (a clean run never negates an expected program
# from scope facts), but the full map keeps the comparison honest if "no" appears.
_ROW_TO_GOLD_DISPOSITION = {
    "yes": "applies",
    "no": "does_not_apply",
    "needs_review": "needs_review",
}


def _predicted_disposition_for_program(program: dict, determinations: list[dict]) -> str | None:
    """The gold-vocab disposition the workflow assigned to *program*, or None if the
    program does not appear in the determinations.

    A determination row carries no program id — only a `requirement` label — so we map
    the program to the set of labels it may legitimately appear under
    (_program_present_labels: its recall-gap name plus each hypothesis's synthesized
    requirement) and read `applies` off the first matching row. This is the SAME
    program<->row linkage the recall-floor invariant uses, so "did the workflow decide
    program X?" means exactly what the pipeline means. The row's yes/no/needs_review is
    normalized into the gold vocab so the two are directly comparable.
    """
    labels = _program_present_labels(program)
    for det in determinations:
        if det.get("requirement") in labels:
            applies = det.get("applies")
            return _ROW_TO_GOLD_DISPOSITION.get(applies, applies)
    return None


# ---------------------------------------------------------------------------
# 1) determination_accuracy
# ---------------------------------------------------------------------------


class DeterminationAccuracyConfig(EvaluatorBaseConfig, name="determination_accuracy"):
    """Per-program disposition accuracy vs the gold label map."""


class DeterminationAccuracyEvaluator(BaseEvaluator):
    def __init__(self, max_concurrency: int = 8):
        super().__init__(max_concurrency=max_concurrency, tqdm_desc="determination_accuracy")

    async def evaluate_item(self, item: EvalInputItem) -> EvalOutputItem:
        scope = _parse_scope(item.input_obj)
        gold = _parse_gold(item.expected_output_obj)
        determinations = _parse_output(item.output_obj).get("determinations", [])

        programs_by_id = {p["id"]: p for p in expected_programs_for_scope(scope)}

        per_program: dict[str, dict] = {}
        matches = 0
        for program_id, gold_label in gold.items():
            program = programs_by_id.get(program_id)
            if program is None:
                # Gold names a program that is not even expected for this scope — a
                # dataset error. Score it 0 and surface it rather than skipping.
                predicted = None
            else:
                predicted = _predicted_disposition_for_program(program, determinations)
            ok = predicted == gold_label
            matches += int(ok)
            per_program[program_id] = {"gold": gold_label, "predicted": predicted, "match": ok}

        total = len(gold)
        score = matches / total if total else 1.0
        return EvalOutputItem(
            id=item.id,
            score=score,
            reasoning={"matched": matches, "total": total, "per_program": per_program},
        )


@register_evaluator(config_type=DeterminationAccuracyConfig)
async def register_determination_accuracy(
    config: DeterminationAccuracyConfig, builder: EvalBuilder
):
    evaluator = DeterminationAccuracyEvaluator(max_concurrency=builder.get_max_concurrency())
    yield EvaluatorInfo(
        config=config,
        evaluate_fn=evaluator.evaluate,
        description="Per-program disposition accuracy vs gold (fraction matching).",
    )


# ---------------------------------------------------------------------------
# 2) grounding_faithfulness
# ---------------------------------------------------------------------------


class GroundingFaithfulnessConfig(EvaluatorBaseConfig, name="grounding_faithfulness"):
    """Fraction of verified determinations whose quote is verbatim in its source."""


class GroundingFaithfulnessEvaluator(BaseEvaluator):
    def __init__(self, max_concurrency: int = 8):
        super().__init__(max_concurrency=max_concurrency, tqdm_desc="grounding_faithfulness")

    async def evaluate_item(self, item: EvalInputItem) -> EvalOutputItem:
        output = _parse_output(item.output_obj)
        determinations = output.get("determinations", [])
        run_id = output.get("run_id")

        # The gathered EvidenceBundles live in the run-scoped STORE keyed by run_id
        # (the live path: spawn_researchers wrote them). `nat eval` runs items
        # concurrently, but run_id resolution uses a process-global guarded by an
        # asyncio.Lock in orchestrate, so only one run's active-id window is open at
        # a time and each item's bundles land under its own run_id (concurrent items
        # serialize on that lock — correct, not parallel). Faithfulness is checked
        # against those real sources via the SAME helper the always-on grounding
        # invariant uses, so the two never disagree.
        bundles: list[dict] = []
        if run_id:
            try:
                bundles = STORE.bundles(run_id)
            except KeyError:
                logger.warning(
                    "grounding_faithfulness: run_id %r not in STORE; no bundles to ground against.",
                    run_id,
                )
                bundles = []
        bundles_by_hypothesis = index_bundles_by_hypothesis(bundles)

        verified = [d for d in determinations if d.get("verified")]
        grounded = [
            d for d in verified if determination_is_grounded(d, bundles, bundles_by_hypothesis)
        ]

        # 1.0 when nothing is verified: faithfulness is "no verified claim is
        # ungrounded", which is vacuously true with zero verified determinations.
        total = len(verified)
        score = (len(grounded) / total) if total else 1.0
        return EvalOutputItem(
            id=item.id,
            score=score,
            reasoning={
                "verified": total,
                "grounded": len(grounded),
                "bundles_available": len(bundles),
                "ungrounded_requirements": [
                    d.get("requirement") for d in verified if d not in grounded
                ],
            },
        )


@register_evaluator(config_type=GroundingFaithfulnessConfig)
async def register_grounding_faithfulness(
    config: GroundingFaithfulnessConfig, builder: EvalBuilder
):
    evaluator = GroundingFaithfulnessEvaluator(max_concurrency=builder.get_max_concurrency())
    yield EvaluatorInfo(
        config=config,
        evaluate_fn=evaluator.evaluate,
        description="Fraction of verified determinations grounded in a verbatim source quote.",
    )


# ---------------------------------------------------------------------------
# 3) expected_program_recall
# ---------------------------------------------------------------------------


class ExpectedProgramRecallConfig(EvaluatorBaseConfig, name="expected_program_recall"):
    """Fraction of expected programs that appear in the determinations."""


class ExpectedProgramRecallEvaluator(BaseEvaluator):
    def __init__(self, max_concurrency: int = 8):
        super().__init__(max_concurrency=max_concurrency, tqdm_desc="expected_program_recall")

    async def evaluate_item(self, item: EvalInputItem) -> EvalOutputItem:
        scope = _parse_scope(item.input_obj)
        determinations = _parse_output(item.output_obj).get("determinations", [])

        present_labels = {d.get("requirement") for d in determinations}
        expected = expected_programs_for_scope(scope)

        surfaced: list[str] = []
        missing: list[str] = []
        for program in expected:
            # A program is "surfaced" if ANY label it may appear under is present —
            # the exact recall-floor coverage test from invariants._check_recall_floor.
            if _program_present_labels(program) & present_labels:
                surfaced.append(program["id"])
            else:
                missing.append(program["id"])

        total = len(expected)
        score = (len(surfaced) / total) if total else 1.0
        return EvalOutputItem(
            id=item.id,
            score=score,
            reasoning={
                "expected": total,
                "surfaced": len(surfaced),
                "missing_program_ids": missing,
            },
        )


@register_evaluator(config_type=ExpectedProgramRecallConfig)
async def register_expected_program_recall(
    config: ExpectedProgramRecallConfig, builder: EvalBuilder
):
    evaluator = ExpectedProgramRecallEvaluator(max_concurrency=builder.get_max_concurrency())
    yield EvaluatorInfo(
        config=config,
        evaluate_fn=evaluator.evaluate,
        description="Fraction of registry x scope expected programs surfaced in the determinations.",
    )
