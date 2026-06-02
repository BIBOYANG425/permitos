"""Importing this module registers all research_aiq AIQ components (functions, evaluators)."""

from research_aiq import evaluators  # noqa: F401
from research_aiq.functions import _spike  # noqa: F401
from research_aiq.functions import finalize  # noqa: F401
from research_aiq.functions import orchestrate  # noqa: F401
from research_aiq.functions import plan_candidates  # noqa: F401
from research_aiq.functions import spawn_researchers  # noqa: F401
from research_aiq.functions import submit_plan  # noqa: F401
