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
