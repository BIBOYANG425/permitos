"""Python port of src/lib/research/__tests__/confidence.test.ts."""
from __future__ import annotations

import pytest
from research_core.confidence import compute_confidence


def _pass(reason: str = "ok") -> dict:
    return {"pass": True, "reason": reason}


def _fail(reason: str = "no") -> dict:
    return {"pass": False, "reason": reason}


class TestComputeConfidence:
    def test_returns_all_pass_base_when_every_check_passes(self):
        result = compute_confidence({
            "currency": _pass(), "authority": _pass(),
            "grounding": _pass(), "predicate_math": _pass(),
        })
        assert result == 0.9

    def test_caps_on_failed_check_rather_than_averaging(self):
        # three passes + one grounding fail must NOT average high;
        # it caps at grounding's ceiling (0.35)
        result = compute_confidence({
            "currency": _pass(), "authority": _pass(),
            "grounding": _fail(), "predicate_math": _pass(),
        })
        assert result == 0.35

    def test_stale_currency_failure_caps_hardest(self):
        result = compute_confidence({
            "currency": _fail(), "authority": _pass(),
            "grounding": _pass(), "predicate_math": _pass(),
        })
        assert result == 0.3

    def test_below_threshold_predicate_failure_lands_in_needs_review_territory(self):
        result = compute_confidence({
            "currency": _pass(), "authority": _pass(),
            "grounding": _pass(), "predicate_math": _fail(),
        })
        assert result == 0.55

    def test_multiple_failures_take_lowest_cap_minus_per_extra_penalty(self):
        # grounding (0.35) + predicate_math (0.55) → min 0.35, then -0.05 for extra failure
        result = compute_confidence({
            "currency": _pass(), "authority": _pass(),
            "grounding": _fail(), "predicate_math": _fail(),
        })
        assert result == 0.3

    def test_never_exceeds_ceiling_and_never_drops_below_floor(self):
        assert compute_confidence({"a": _pass()}) <= 0.97
        assert compute_confidence({
            "a": _fail(), "b": _fail(), "c": _fail(), "d": _fail(), "e": _fail(),
        }) >= 0.05

    def test_self_consistency_instability_scales_confidence_down(self):
        checks = {
            "currency": _pass(), "authority": _pass(),
            "grounding": _pass(), "predicate_math": _pass(),
        }
        stable = compute_confidence(checks, {"samples": 5, "stableSamples": 5})
        shaky = compute_confidence(checks, {"samples": 5, "stableSamples": 3})
        unstable = compute_confidence(checks, {"samples": 5, "stableSamples": 0})
        assert stable == 0.9  # full stability = no penalty
        assert shaky < stable
        assert unstable < shaky

    def test_is_monotonic_adding_failed_check_never_raises_confidence(self):
        base = compute_confidence({
            "currency": _pass(), "authority": _pass(),
            "grounding": _pass(), "predicate_math": _pass(),
        })
        with_fail = compute_confidence({
            "currency": _pass(), "authority": _pass(),
            "grounding": _pass(), "predicate_math": _fail(),
        })
        assert with_fail <= base
