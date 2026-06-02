"""
Faithful Python port of src/lib/research/toolCatalog.ts.

Design decision: all data is plain dicts. Type aliases exist for documentation only.
"""

from __future__ import annotations

from typing import Literal

# ---------------------------------------------------------------------------
# Type aliases (documentation only)
# ---------------------------------------------------------------------------

AgentRole = Literal[
    "intake", "planner", "triage", "researcher", "verifier",
    "synthesizer", "discovery", "system", "all"
]

ToolCategory = Literal[
    "intake_jurisdiction", "knowledge_base_read", "retrieval_currency",
    "verification_defensibility", "discovery", "output_compliance", "harness_control"
]

ToolWriteTarget = Literal[
    "none", "projects", "fetched_sources", "extractions", "verification_records",
    "determinations", "staging", "audit_log", "fetched_sources_and_determinations"
]

# ---------------------------------------------------------------------------
# Catalog — order is significant (universalHarnessToolIds preserves it)
# ---------------------------------------------------------------------------

HARNESS_TOOL_CATALOG: list[dict] = [
    {
        "id": "resolve_jurisdiction",
        "category": "intake_jurisdiction",
        "description": "Resolve an address into the ordered federal, state, regional, county, and city agency stack.",
        "writes": "none",
        "scopedTo": ["planner"],
    },
    {
        "id": "normalize_attributes",
        "category": "intake_jurisdiction",
        "description": "Normalize intake text into typed project attributes such as SIC, NAICS, quantities, equipment, and discharges.",
        "writes": "projects",
        "scopedTo": ["intake"],
    },
    {
        "id": "lookup_naics_sic",
        "category": "intake_jurisdiction",
        "description": "Classify facility activity into candidate NAICS/SIC codes for downstream trigger checks.",
        "writes": "none",
        "scopedTo": ["intake", "planner"],
    },
    {
        "id": "intake_completeness_gate",
        "category": "intake_jurisdiction",
        "description": "Run schema, coverage, value-of-information, and confidence gates before research begins.",
        "writes": "none",
        "scopedTo": ["intake"],
        "safetyCritical": True,
    },
    {
        "id": "ask_user",
        "category": "intake_jurisdiction",
        "description": "Ask targeted clarification questions only when the answer can change applicability or threshold math.",
        "writes": "none",
        "scopedTo": ["intake", "verifier"],
    },
    {
        "id": "map_query_programs",
        "category": "knowledge_base_read",
        "description": "Map a jurisdiction stack and domain hints to candidate permit programs.",
        "writes": "none",
        "scopedTo": ["planner", "triage"],
    },
    {
        "id": "get_triggers",
        "category": "knowledge_base_read",
        "description": "Load trigger, exemption, and exclusion predicates for a permit program.",
        "writes": "none",
        "scopedTo": ["researcher"],
    },
    {
        "id": "get_source_pointers",
        "category": "knowledge_base_read",
        "description": "Load canonical allowlisted source URLs and authority rank for a permit program.",
        "writes": "none",
        "scopedTo": ["researcher"],
    },
    {
        "id": "get_cached_source",
        "category": "knowledge_base_read",
        "description": "Read a fresh, non-superseded fetched source from the source cache.",
        "writes": "none",
        "scopedTo": ["researcher"],
    },
    {
        "id": "read_skill",
        "category": "knowledge_base_read",
        "description": "Read an EHS domain skill (triggers, threshold ranges, exemptions, and which primary source to fetch) to orient research. Reference only — never citable evidence; ground every claim in a fetched primary source.",
        "writes": "none",
        "scopedTo": ["researcher"],
    },
    {
        "id": "get_form",
        "category": "knowledge_base_read",
        "description": "Select a human-verified form registry row for a verified applicable permit program.",
        "writes": "none",
        "scopedTo": ["synthesizer"],
        "safetyCritical": True,
    },
    {
        "id": "fetch_source",
        "category": "retrieval_currency",
        "description": "Fetch only allowlisted source or form URLs and compute a content hash.",
        "writes": "fetched_sources",
        "scopedTo": ["researcher"],
        "safetyCritical": True,
    },
    {
        "id": "prove_currency",
        "category": "retrieval_currency",
        "description": "Determine current, stale, or unconfirmed status from fetched text, headers, and known date fields.",
        "writes": "none",
        "scopedTo": ["researcher", "verifier"],
        "safetyCritical": True,
    },
    {
        "id": "extract_threshold",
        "category": "retrieval_currency",
        "description": "Extract the triggering clause, threshold value, and verbatim quote from fetched text.",
        "writes": "extractions",
        "scopedTo": ["researcher"],
        "safetyCritical": True,
    },
    {
        "id": "evaluate_predicate",
        "category": "retrieval_currency",
        "description": "Evaluate trigger, exemption, and exclusion predicates against typed project attributes.",
        "writes": "none",
        "scopedTo": ["researcher"],
    },
    {
        "id": "crosscheck_source",
        "category": "retrieval_currency",
        "description": "Confirm a high-stakes claim against a second authority pointer.",
        "writes": "none",
        "scopedTo": ["verifier"],
        "safetyCritical": True,
    },
    {
        "id": "quarantine_injection",
        "category": "retrieval_currency",
        "description": "Flag instruction-like fetched content as untrusted data and prevent following embedded filing or form links.",
        "writes": "audit_log",
        "scopedTo": ["researcher"],
        "safetyCritical": True,
    },
    {
        "id": "verify_determination",
        "category": "verification_defensibility",
        "description": "Check currency, authority, grounding, predicate math, and cross-source evidence before synthesis.",
        "writes": "verification_records",
        "scopedTo": ["verifier"],
        "safetyCritical": True,
    },
    {
        "id": "self_consistency",
        "category": "verification_defensibility",
        "description": "Rerun the determination with varied phrasing to detect unstable permit sets or determinative unknowns.",
        "writes": "none",
        "scopedTo": ["verifier"],
    },
    {
        "id": "verify_determination_set",
        "category": "verification_defensibility",
        "description": "Check the full candidate permit set for silent drops, missing dispositions, exemption-exceptions, narrative catch-alls, and precedent mismatches.",
        "writes": "verification_records",
        "scopedTo": ["verifier"],
        "safetyCritical": True,
    },
    {
        "id": "verify_process_trace",
        "category": "verification_defensibility",
        "description": "Mechanically verify the audit trail: every cited source was fetched, every hash exists, every quote span exists, and every form came from a human-verified registry row.",
        "writes": "verification_records",
        "scopedTo": ["verifier", "system"],
        "safetyCritical": True,
    },
    {
        "id": "run_eval_set",
        "category": "verification_defensibility",
        "description": "Compare a run or harness change against golden cases so known omission and grounding failures stay caught.",
        "writes": "verification_records",
        "scopedTo": ["verifier", "system"],
    },
    {
        "id": "set_review_flag",
        "category": "verification_defensibility",
        "description": "Mark novel, low-confidence, exemption-exception, or blocked determinations for human review.",
        "writes": "determinations",
        "scopedTo": ["verifier"],
        "safetyCritical": True,
    },
    {
        "id": "schema_gate",
        "category": "verification_defensibility",
        "description": "Block client-facing output unless required citations, quotes, dates, form rows, and verifier checks exist.",
        "writes": "none",
        "scopedTo": ["synthesizer"],
        "safetyCritical": True,
    },
    {
        "id": "discover_regime",
        "category": "discovery",
        "description": "Search for a governing regime when no existing map entry covers a decision-relevant attribute.",
        "writes": "none",
        "scopedTo": ["discovery"],
    },
    {
        "id": "propose_map_entry",
        "category": "discovery",
        "description": "Stage a new permit program, trigger, and source pointer for human approval.",
        "writes": "staging",
        "scopedTo": ["discovery"],
        "safetyCritical": True,
    },
    {
        "id": "propose_form_entry",
        "category": "discovery",
        "description": "Stage a candidate form registry row with human_verified=false.",
        "writes": "staging",
        "scopedTo": ["discovery"],
        "safetyCritical": True,
    },
    {
        "id": "build_applicability_matrix",
        "category": "output_compliance",
        "description": "Assemble applicability rows from verified determinations and needs-review gaps.",
        "writes": "determinations",
        "scopedTo": ["synthesizer"],
    },
    {
        "id": "generate_compliance_calendar",
        "category": "output_compliance",
        "description": "Convert verified matrix rows into dated compliance tasks for a later stage.",
        "writes": "none",
        "scopedTo": ["synthesizer"],
    },
    {
        "id": "assemble_review_package",
        "category": "output_compliance",
        "description": "Bundle the matrix, evidence trail, open gaps, and human-review handoff package.",
        "writes": "none",
        "scopedTo": ["synthesizer"],
    },
    {
        "id": "spawn_subagents",
        "category": "harness_control",
        "description": "Fan out bounded research workers from the scoped task graph.",
        "writes": "none",
        "scopedTo": ["planner"],
        "safetyCritical": True,
    },
    {
        "id": "send_subagent_message",
        "category": "harness_control",
        "description": "Send scoped task input, repair instructions, or cancellation notices to a running subagent.",
        "writes": "none",
        "scopedTo": ["planner", "system"],
    },
    {
        "id": "wait_for_subagents",
        "category": "harness_control",
        "description": "Join one or more subagents, preserving task IDs and failure states.",
        "writes": "none",
        "scopedTo": ["planner", "system"],
    },
    {
        "id": "cancel_subagent",
        "category": "harness_control",
        "description": "Stop a worker that exceeded budget, lost relevance, or was superseded by a repair path.",
        "writes": "audit_log",
        "scopedTo": ["planner", "system"],
        "safetyCritical": True,
    },
    {
        "id": "send_message",
        "category": "harness_control",
        "description": "Emit a controlled status message to the run UI or human-review channel without changing legal determinations.",
        "writes": "none",
        "scopedTo": ["all"],
        "universal": True,
    },
    {
        "id": "emit_trace_event",
        "category": "harness_control",
        "description": "Record an artifact transition, tool call, verifier decision, or worker lifecycle event.",
        "writes": "audit_log",
        "scopedTo": ["all"],
        "universal": True,
    },
    {
        "id": "validate_artifact_schema",
        "category": "harness_control",
        "description": "Validate every typed artifact before it crosses an agent boundary.",
        "writes": "none",
        "scopedTo": ["all"],
        "universal": True,
        "safetyCritical": True,
    },
    {
        "id": "log_step",
        "category": "harness_control",
        "description": "Append the meaningful action, inputs, outputs, sources, and tool result to the audit log.",
        "writes": "audit_log",
        "scopedTo": ["all"],
        "universal": True,
        "safetyCritical": True,
    },
    {
        "id": "freshness_sweep",
        "category": "harness_control",
        "description": "Scheduled crawl of source pointers and forms, diff hashes, and re-flag affected determinations.",
        "writes": "fetched_sources_and_determinations",
        "scopedTo": ["system"],
        "safetyCritical": True,
    },
    {
        "id": "escalate_to_human",
        "category": "harness_control",
        "description": "Hand a review-flagged project to a licensed human reviewer; the agent never files.",
        "writes": "none",
        "scopedTo": ["all"],
        "universal": True,
        "safetyCritical": True,
    },
]

# HarnessToolId: str (concrete union not needed at runtime)
HarnessToolId = str

# ---------------------------------------------------------------------------
# Derived constants — order is preserved from catalog insertion order
# ---------------------------------------------------------------------------

universal_harness_tool_ids: list[str] = [
    tool["id"] for tool in HARNESS_TOOL_CATALOG if tool.get("universal")
]

subagent_control_tool_ids: list[str] = [
    "spawn_subagents",
    "send_subagent_message",
    "wait_for_subagents",
    "cancel_subagent",
]

researcher_core_tool_ids: list[str] = [
    "read_skill",
    "get_triggers",
    "get_source_pointers",
    "get_cached_source",
    "fetch_source",
    "prove_currency",
    "extract_threshold",
    "evaluate_predicate",
    "quarantine_injection",
]

blocked_researcher_tool_ids: list[str] = [
    "get_form",
    "build_applicability_matrix",
    "generate_compliance_calendar",
    "assemble_review_package",
    "freshness_sweep",
    "propose_map_entry",
    "propose_form_entry",
]

# ---------------------------------------------------------------------------
# Functions
# ---------------------------------------------------------------------------


def get_tool(tool_id: str) -> dict:
    for entry in HARNESS_TOOL_CATALOG:
        if entry["id"] == tool_id:
            return entry
    raise ValueError(f"Unknown harness tool: {tool_id}")


def is_tool_scoped_to_role(tool_id: str, role: str) -> bool:
    scoped_to = get_tool(tool_id)["scopedTo"]
    return "all" in scoped_to or role in scoped_to


def tool_ids_for_role(role: str) -> list[str]:
    return [tool["id"] for tool in HARNESS_TOOL_CATALOG if is_tool_scoped_to_role(tool["id"], role)]


def research_worker_tool_ids() -> list[str]:
    """Return the deduplicated union of universal + researcher-core tool IDs, in insertion order."""
    return _unique_tool_ids([*universal_harness_tool_ids, *researcher_core_tool_ids])


def blocked_tool_ids_for_role(role: str) -> list[str]:
    if role == "researcher":
        return list(blocked_researcher_tool_ids)
    return []


def _unique_tool_ids(ids: list[str]) -> list[str]:
    """Deduplicate preserving first-occurrence order (mirrors JS Set insertion order)."""
    return list(dict.fromkeys(ids))
