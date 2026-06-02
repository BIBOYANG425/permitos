"""
Faithful Python port of src/lib/research/types.ts.

Design decision: all pipeline data is represented as plain dicts matching the
JSON shapes.  These TypedDict / Literal aliases exist for documentation and
static-typing only — functions accept and return plain dicts.
"""

from __future__ import annotations

from typing import Literal, Optional, TypedDict

# ---------------------------------------------------------------------------
# HarnessToolId — concrete union lives in tool_catalog.py (to be ported).
# For now alias to str so allowed_tools / blocked_tools remain faithful.
# ---------------------------------------------------------------------------
HarnessToolId = str  # tool_catalog.py will replace this with the concrete Literal union

# ---------------------------------------------------------------------------
# Scalar union aliases
# ---------------------------------------------------------------------------

RunStatus = Literal["idle", "queued", "running", "partial", "needs_review", "done", "failed"]

CoverageFamily = Literal[
    "air",
    "stormwater",
    "hazmat",
    "waste",
    "wastewater",
    "land_use",
    "fire_code",
    "ceqa",
    "osha",
]

CoverageStatus = Literal["active", "blocked_missing_fact", "out_of_scope", "discovery_candidate"]


# ---------------------------------------------------------------------------
# ProjectFact
# ---------------------------------------------------------------------------


class ProjectFact(TypedDict):
    field: str
    value: object  # TS: unknown
    source: Literal["intake", "seeded_demo", "derived", "missing"]


# ---------------------------------------------------------------------------
# ScopePack — nested inline shapes
# ---------------------------------------------------------------------------


class _ScopePackEquipmentItem(TypedDict):
    kind: str
    description: str


class _ScopePackChemicalItem(TypedDict, total=False):
    name: str
    quantity: Optional[float]
    unit: Optional[str]
    hazard: str  # optional in TS (field?)


class _ScopePackChemicalItemRequired(TypedDict):
    name: str
    quantity: Optional[float]
    unit: Optional[str]


# Combine required + optional chemical fields via inheritance
class ScopePackChemicalItem(_ScopePackChemicalItemRequired, total=False):
    hazard: str


class _ScopePackWasteStream(TypedDict):
    description: str
    kg_per_month: Optional[float]


class _ScopePackMissingFact(TypedDict):
    field: str
    why_needed: str
    blocks: list[str]


class _ScopePackAssumption(TypedDict):
    claim: str
    basis: str
    confidence: float


class _ScopePackFacility(TypedDict):
    address: str
    jurisdiction_stack: list[str]
    naics: Optional[str]
    sic: Optional[str]


class _ScopePackProjectChange(TypedDict):
    description: str
    equipment: list[_ScopePackEquipmentItem]
    chemicals: list[ScopePackChemicalItem]
    waste_streams: list[_ScopePackWasteStream]
    disturbance_acres: Optional[float]
    process_discharge: Optional[bool]


class ScopePack(TypedDict):
    run_id: str
    facility: _ScopePackFacility
    project_change: _ScopePackProjectChange
    missing_facts: list[_ScopePackMissingFact]
    assumptions: list[_ScopePackAssumption]


# ---------------------------------------------------------------------------
# CoverageFamilyStatus
# ---------------------------------------------------------------------------


class CoverageFamilyStatus(TypedDict):
    id: str
    family: CoverageFamily
    status: CoverageStatus
    reason: str
    project_facts_considered: list[str]
    missing_facts: list[str]


# ---------------------------------------------------------------------------
# RegulatoryAngle
# ---------------------------------------------------------------------------


class RegulatoryAngle(TypedDict):
    id: str
    family: CoverageFamily
    label: str
    reason: str
    triggering_facts: list[str]
    status: CoverageStatus


# ---------------------------------------------------------------------------
# ResearchHypothesis
# ---------------------------------------------------------------------------


class _ResearchHypothesisRequired(TypedDict):
    id: str
    angle_id: str
    family: CoverageFamily
    question: str
    required_facts: list[str]
    expected_source_type: Literal[
        "statute", "regulation", "agency_guidance", "permit_portal", "technical_doc"
    ]
    success_criteria: list[str]
    dependencies: list[str]


class ResearchHypothesis(_ResearchHypothesisRequired, total=False):
    claim_to_test: str  # optional in TS (field?)


# ---------------------------------------------------------------------------
# ResearchTask
# ---------------------------------------------------------------------------


class _ResearchTaskBudget(TypedDict):
    max_sources: int
    max_runtime_seconds: int
    max_model_calls: int


class _ResearchTaskRequired(TypedDict):
    task_id: str
    hypothesis_id: str
    assigned_agent: str
    allowed_tools: list[HarnessToolId]
    blocked_tools: list[HarnessToolId]
    budget: _ResearchTaskBudget


class ResearchTask(_ResearchTaskRequired, total=False):
    repair_instruction: str  # optional in TS (field?)


# ---------------------------------------------------------------------------
# SourceFixture
# ---------------------------------------------------------------------------


class _PermitFiling(TypedDict, total=False):
    form_name: str
    form_url: str
    agency: str
    portal_url: str
    instructions: str  # optional in TS (field?)


class _PermitFilingRequired(TypedDict):
    form_name: str
    form_url: str
    agency: str
    portal_url: str


class PermitFiling(_PermitFilingRequired, total=False):
    instructions: str


class _SourceFixtureRequired(TypedDict):
    id: str
    family: CoverageFamily
    source_name: str
    url: str
    authority_rank: int
    fetched_at: str
    content_hash: str
    effective_date: Optional[str]
    quote: str
    extracted: dict[str, str | int | bool | None]


class SourceFixture(_SourceFixtureRequired, total=False):
    permit_filing: PermitFiling  # optional in TS (field?)


# ---------------------------------------------------------------------------
# EvidenceBundle
# ---------------------------------------------------------------------------


class _EvidenceBundleSource(TypedDict):
    url: str
    source_name: str
    authority_rank: int
    fetched_at: str
    content_hash: str
    effective_date: Optional[str]
    quote: str


class _EvidenceBundleExtractedClaim(TypedDict):
    field: str
    value: str
    source_url: str
    quote: str
    confidence: float


class _EvidenceBundleRequired(TypedDict):
    hypothesis_id: str
    sources: list[_EvidenceBundleSource]
    extracted_claims: list[_EvidenceBundleExtractedClaim]
    researcher_conclusion: Literal["applies", "does_not_apply", "needs_review"]
    uncertainties: list[str]


class EvidenceBundle(_EvidenceBundleRequired, total=False):
    permit_filing: PermitFiling  # optional in TS (field?)


# ---------------------------------------------------------------------------
# RepairTicket (defined before VerificationVerdict which references it)
# ---------------------------------------------------------------------------


class RepairTicket(TypedDict):
    ticket_id: str
    hypothesis_id: str
    failure_type: Literal[
        "grounding_failed", "source_failed", "missing_fact", "invalid_json", "conflict"
    ]
    failed_check: str
    observed_problem: str
    repair_action: str
    max_attempts_remaining: int


# ---------------------------------------------------------------------------
# VerificationVerdict
# ---------------------------------------------------------------------------

# TS: checks: Record<string, { pass: boolean; reason: string }>
# "pass" is a Python keyword — it is not a valid TypedDict field identifier.
# Use a plain dict[str, Any] for the inner shape; callers access via dict["pass"].
# We document the expected shape with a comment rather than a TypedDict.
#   Each check value: {"pass": bool, "reason": str}
VerdictChecks = dict[str, dict]  # inner dict: {"pass": bool, "reason": str}


class VerificationVerdict(TypedDict):
    hypothesis_id: str
    verdict: Literal["pass", "fail", "needs_review"]
    checks: VerdictChecks
    confidence: float
    repair_tickets: list[RepairTicket]


# ---------------------------------------------------------------------------
# Determination
# ---------------------------------------------------------------------------


class _DeterminationRequired(TypedDict):
    requirement: str
    applies: Literal["yes", "no", "needs_review"]
    trigger: str
    project_fact: str
    citation: str
    quote: str
    source_url: str
    confidence: float
    verified: bool
    review_flag: bool


class Determination(_DeterminationRequired, total=False):
    permit_filing: PermitFiling  # optional in TS (field?)
    # SDS out of scope for sub-project A
    sds_handoff_refs: list[dict]  # SdsHandoffRef[] — SDS out of scope for sub-project A


# ---------------------------------------------------------------------------
# TraceEvent
# ---------------------------------------------------------------------------


class _TraceEventRequired(TypedDict):
    id: str
    run_id: str
    ts: str
    actor: str
    phase: str
    status: Literal["queued", "running", "done", "failed", "needs_review"]
    message: str


class TraceEvent(_TraceEventRequired, total=False):
    artifact_id: str  # optional in TS (field?)


# ---------------------------------------------------------------------------
# MemoryUpdate
# ---------------------------------------------------------------------------


class MemoryUpdate(TypedDict):
    memory_type: Literal["verified_source_fact", "failed_hypothesis", "run_metric"]
    fact: str
    source_url: Optional[str]
    content_hash: Optional[str]
    quote: Optional[str]
    verifier_verdict: Literal["pass", "fail", "needs_review"]
    as_of_date: Optional[str]
    expires_or_recheck_after: Optional[str]


# ---------------------------------------------------------------------------
# ResearchRun
# ---------------------------------------------------------------------------


class _ResearchRunRequired(TypedDict):
    run_id: str
    status: RunStatus
    project_facts: dict[str, object]  # Record<string, unknown>
    jurisdiction_stack: list[str]
    scope_pack: ScopePack
    coverage_family_statuses: list[CoverageFamilyStatus]
    regulatory_angles: list[RegulatoryAngle]
    research_graph: list[ResearchHypothesis]
    research_tasks: list[ResearchTask]
    evidence_bundles: list[EvidenceBundle]
    verification_verdicts: list[VerificationVerdict]
    repair_tickets: list[RepairTicket]
    memory_updates: list[MemoryUpdate]
    determinations: list[Determination]
    trace_events: list[TraceEvent]
    report_markdown: str


class ResearchRun(_ResearchRunRequired, total=False):
    # SDS out of scope for sub-project A
    sds_reviews: list[dict]  # SdsReview[] — SDS out of scope for sub-project A


# ---------------------------------------------------------------------------
# ResearchRunInput
# ---------------------------------------------------------------------------


class _ResearchRunInputDocument(TypedDict):
    name: str
    type: str  # "sds" | "tds" | "permit" | "equipment_spec" | "other" | string (open)
    text: str


class _ResearchRunInputRequired(TypedDict):
    project_description: str


class ResearchRunInput(_ResearchRunInputRequired, total=False):
    demo_documents: list[_ResearchRunInputDocument]  # optional in TS (field?)
