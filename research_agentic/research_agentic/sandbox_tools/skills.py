"""read_skill — load a bundled law-code skill for orientation (NEVER citable evidence).

Adapted from the parent repo's agents._read_law_skill. Reads research_agentic/skills/<id>/
SKILL.md. The skill_id is validated to a single path segment (no traversal). The
hypothesis-fallback (skill_for_hypothesis) is added in Phase 3 with the ported registry.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from research_agentic.policy import _error, _success

_SKILLS_ROOT = Path(__file__).resolve().parents[1] / "skills"


def read_skill(skill_id: str = "") -> dict[str, Any]:
    sid = (skill_id or "").strip()
    # A skill id is a single folder name — reject anything with path separators / traversal.
    if not sid or "/" in sid or "\\" in sid or sid in {".", ".."} or ".." in Path(sid).parts:
        return _error("error", "skill_not_found", f"No law-code skill found for {skill_id!r}.", skill_id=skill_id)
    path = _SKILLS_ROOT / sid / "SKILL.md"
    if not path.exists() or not path.is_file():
        return _error("error", "skill_not_found", f"No law-code skill found for {skill_id!r}.", skill_id=skill_id)
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as exc:
        return _error("error", "skill_read_failed", str(exc), skill_id=skill_id)
    return _success("read", skill_id=sid, content=content)
