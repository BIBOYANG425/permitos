"""Canonicalize structured artifacts for cross-language parity comparison.

JSON object keys are order-insensitive (sort them); array order IS significant
(preserve). Floats are rounded to a fixed precision so TS's number formatting and
Python's repr agree. Ints and floats compare numerically (1 == 1.0)."""

from __future__ import annotations
import json
from typing import Any

FLOAT_PRECISION = 9


def _norm(value: Any) -> Any:
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        return round(value, FLOAT_PRECISION)
    if isinstance(value, int):
        return round(float(value), FLOAT_PRECISION)
    if isinstance(value, dict):
        return {k: _norm(value[k]) for k in sorted(value.keys())}
    if isinstance(value, (list, tuple)):
        return [_norm(v) for v in value]
    return value


def canonical(value: Any) -> str:
    """Stable string form: sorted keys, normalized numbers, preserved array order."""
    return json.dumps(_norm(value), ensure_ascii=False, separators=(",", ":"))
