import type { HarnessToolId } from "./toolCatalog";

export type RunStatus =
  | "idle"
  | "queued"
  | "running"
  | "partial"
  | "needs_review"
  | "done"
  | "failed";

export type CoverageFamily =
  | "air"
  | "stormwater"
  | "hazmat"
  | "waste"
  | "wastewater"
  | "land_use"
  | "fire_code"
  | "ceqa"
  | "osha";

export type CoverageStatus =
  | "active"
  | "blocked_missing_fact"
  | "out_of_scope"
  | "discovery_candidate";

export type ProjectFact = {
  field: string;
  value: unknown;
  source: "intake" | "seeded_demo" | "derived" | "missing";
};

export type ScopePack = {
  run_id: string;
  facility: {
    address: string;
    jurisdiction_stack: string[];
    naics: string | null;
    sic: string | null;
  };
  project_change: {
    description: string;
    equipment: Array<{ kind: string; description: string }>;
    chemicals: Array<{ name: string; quantity: number | null; unit: string | null; hazard?: string }>;
    waste_streams: Array<{ description: string; kg_per_month: number | null }>;
    disturbance_acres: number | null;
    process_discharge: boolean | null;
  };
  missing_facts: Array<{ field: string; why_needed: string; blocks: string[] }>;
  assumptions: Array<{ claim: string; basis: string; confidence: number }>;
};

export type CoverageFamilyStatus = {
  id: string;
  family: CoverageFamily;
  status: CoverageStatus;
  reason: string;
  project_facts_considered: string[];
  missing_facts: string[];
};

export type RegulatoryAngle = {
  id: string;
  family: CoverageFamily;
  label: string;
  reason: string;
  triggering_facts: string[];
  status: CoverageStatus;
};

export type ResearchHypothesis = {
  id: string;
  angle_id: string;
  family: CoverageFamily;
  question: string;
  claim_to_test?: string;
  required_facts: string[];
  expected_source_type: "statute" | "regulation" | "agency_guidance" | "permit_portal" | "technical_doc";
  success_criteria: string[];
  dependencies: string[];
};

export type ResearchTask = {
  task_id: string;
  hypothesis_id: string;
  assigned_agent: string;
  allowed_tools: HarnessToolId[];
  blocked_tools: HarnessToolId[];
  budget: {
    max_sources: number;
    max_runtime_seconds: number;
    max_model_calls: number;
  };
};

export type SourceFixture = {
  id: string;
  family: CoverageFamily;
  source_name: string;
  url: string;
  authority_rank: number;
  fetched_at: string;
  content_hash: string;
  effective_date: string | null;
  quote: string;
  extracted: Record<string, string | number | boolean | null>;
  permit_filing?: {
    form_name: string;
    form_url: string;
    agency: string;
    portal_url: string;
    instructions?: string;
  };
};

export type EvidenceBundle = {
  hypothesis_id: string;
  sources: Array<{
    url: string;
    source_name: string;
    authority_rank: number;
    fetched_at: string;
    content_hash: string;
    effective_date: string | null;
    quote: string;
  }>;
  extracted_claims: Array<{
    field: string;
    value: string;
    source_url: string;
    quote: string;
    confidence: number;
  }>;
  researcher_conclusion: "applies" | "does_not_apply" | "needs_review";
  uncertainties: string[];
  permit_filing?: {
    form_name: string;
    form_url: string;
    agency: string;
    portal_url: string;
    instructions?: string;
  };
};

export type VerificationVerdict = {
  hypothesis_id: string;
  verdict: "pass" | "fail" | "needs_review";
  checks: Record<string, { pass: boolean; reason: string }>;
  confidence: number;
  repair_tickets: RepairTicket[];
};

export type RepairTicket = {
  ticket_id: string;
  hypothesis_id: string;
  failure_type: "grounding_failed" | "source_failed" | "missing_fact" | "invalid_json" | "conflict";
  failed_check: string;
  observed_problem: string;
  repair_action: string;
  max_attempts_remaining: number;
};

export type Determination = {
  requirement: string;
  applies: "yes" | "no" | "needs_review";
  trigger: string;
  project_fact: string;
  citation: string;
  quote: string;
  source_url: string;
  confidence: number;
  verified: boolean;
  review_flag: boolean;
  permit_filing?: {
    form_name: string;
    form_url: string;
    agency: string;
    portal_url: string;
    instructions?: string;
  };
};

export type TraceEvent = {
  id: string;
  run_id: string;
  ts: string;
  actor: string;
  phase: string;
  status: "queued" | "running" | "done" | "failed" | "needs_review";
  message: string;
  artifact_id?: string;
};

export type MemoryUpdate = {
  memory_type: "verified_source_fact" | "failed_hypothesis" | "run_metric";
  fact: string;
  source_url: string | null;
  content_hash: string | null;
  quote: string | null;
  verifier_verdict: "pass" | "fail" | "needs_review";
  as_of_date: string | null;
  expires_or_recheck_after: string | null;
};

export type ResearchRun = {
  run_id: string;
  status: RunStatus;
  project_facts: Record<string, unknown>;
  jurisdiction_stack: string[];
  scope_pack: ScopePack;
  coverage_family_statuses: CoverageFamilyStatus[];
  regulatory_angles: RegulatoryAngle[];
  research_graph: ResearchHypothesis[];
  research_tasks: ResearchTask[];
  evidence_bundles: EvidenceBundle[];
  verification_verdicts: VerificationVerdict[];
  repair_tickets: RepairTicket[];
  memory_updates: MemoryUpdate[];
  determinations: Determination[];
  trace_events: TraceEvent[];
  report_markdown: string;
};

export type ResearchRunInput = {
  project_description: string;
  demo_documents?: Array<{
    name: string;
    type: "sds" | "tds" | "permit" | "equipment_spec" | "other" | string;
    text: string;
  }>;
};
