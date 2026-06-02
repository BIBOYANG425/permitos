"""Faithful Python port of src/lib/research/confidence.ts.

compute_confidence(checks, consistency=None) → float

Two principles:
  1. CAP, don't average. A failed check ceilings confidence at that check's
     cap; passing the other three cannot buy it back.
  2. Self-consistency scales it. Instability across N re-runs lowers
     confidence; full stability applies no penalty.
"""

from __future__ import annotations

# Ceiling a failed check imposes, ordered by how fatal the failure is.
FAIL_CAP: dict[str, float] = {
    "currency": 0.3,
    "grounding": 0.35,
    "authority": 0.5,
    "predicate_math": 0.55,
    "cross_source": 0.7,
}

_DEFAULT_FAIL_CAP = 0.6
_BASE_ALL_PASS = 0.9       # residual uncertainty even when every check passes
_PER_EXTRA_FAIL_PENALTY = 0.05
_MIN_CONFIDENCE = 0.05
_MAX_CONFIDENCE = 0.97


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _round2(value: float) -> float:
    return round(value * 100) / 100


def compute_confidence(checks: dict, consistency: dict | None = None) -> float:
    """Mirror computeConfidence from confidence.ts.

    Args:
        checks: dict of check_name → {"pass": bool, "reason": str}
        consistency: optional dict with "samples" and "stable_samples" (or
                     "stableSamples") keys, mirroring ConsistencySignal.
    Returns:
        Confidence in [MIN_CONFIDENCE, MAX_CONFIDENCE], rounded to 2 decimal places.
    """
    failed = [(name, c) for name, c in checks.items() if not c["pass"]]

    confidence = _BASE_ALL_PASS
    for name, _ in failed:
        confidence = min(confidence, FAIL_CAP.get(name, _DEFAULT_FAIL_CAP))

    if len(failed) > 1:
        confidence -= _PER_EXTRA_FAIL_PENALTY * (len(failed) - 1)

    if consistency is not None:
        samples = consistency.get("samples", 0)
        if samples > 0:
            # Accept both camelCase (from TS) and snake_case keys.
            stable = consistency.get("stable_samples") or consistency.get("stableSamples", 0)
            stability = _clamp(stable / samples, 0, 1)
            confidence *= 0.6 + 0.4 * stability

    return _round2(_clamp(confidence, _MIN_CONFIDENCE, _MAX_CONFIDENCE))
