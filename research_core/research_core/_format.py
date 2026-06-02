"""Shared JS-style string formatter for nullable/boolean values.

Mirrors how TypeScript template literals serialize None/bool:
  None  → "null"
  True  → "true"
  False → "false"
  other → str(value)
"""

from __future__ import annotations


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
