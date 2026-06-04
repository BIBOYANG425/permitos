"""Importing this module registers all research_agentic AIQ components.

nat discovers components via the [project.entry-points.'nat.components'] table, which
points here. Each researcher-tool function is registered by importing its module (the
@register_function decorators run on import). The tool functions are added in Task 16;
until then this module is intentionally import-only so entry-point discovery works.
"""

from research_agentic.functions import researcher_tools  # noqa: F401
