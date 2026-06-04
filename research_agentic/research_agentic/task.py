"""The unit of work handed to a researcher: one hypothesis + scope context.

to_input_message() is the agent's input_message (a JSON string). The researcher system
prompt instructs the agent to investigate `hypothesis`, orient via `skill_id`, treat
`facts`/`provided_documents` as primary data, and end with submit_finding.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ResearcherTask:
    run_id: str
    hypothesis: str
    skill_id: str | None = None
    facts: dict[str, Any] = field(default_factory=dict)
    provided_documents: list[dict[str, Any]] = field(default_factory=list)

    def to_input_message(self) -> str:
        return json.dumps(
            {
                "hypothesis": self.hypothesis,
                "skill_id": self.skill_id,
                "facts": self.facts,
                "provided_documents": self.provided_documents,
            },
            sort_keys=True,
        )
