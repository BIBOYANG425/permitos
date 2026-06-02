"""Shared JS-style string formatter for nullable/boolean values.

Mirrors how TypeScript template literals serialize None/bool:
  None  → "null"
  True  → "true"
  False → "false"
  other → str(value)

Also provides js_round(), which replicates Math.round for the non-negative
domain used in this project.  Python's built-in round() is banker's rounding
(half-to-even); JS Math.round is always half-up.  Example: round(0.5) → 0 in
Python but Math.round(0.5) → 1 in JS.
"""

from __future__ import annotations

import math


def js_round(value: float) -> float:
    """Replicate Math.round for non-negative values: floor(x + 0.5)."""
    return math.floor(value + 0.5)


def js_str(value) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    return str(value)


def js_num(value) -> str:
    """Format a number the way JS does in template literals.

    JS prints integer-valued floats WITHOUT a decimal point:
      String(55) → "55"   (not "55.0")
      String(55.5) → "55.5"
    Python str(55.0) → "55.0", so we need this helper.
    """
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)
