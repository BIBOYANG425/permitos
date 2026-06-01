export type SdsSourceType = "pdf" | "pasted_text";

export type SdsRetention = "ephemeral" | "save_for_audit";

export type SdsTextExtractionStatus = "ok" | "empty" | "unreadable" | "needs_pasted_text";

export type SdsOverallStatus =
  | "complete"
  | "incomplete"
  | "stale"
  | "unreadable"
  | "needs_expert_review";

export type SdsSectionStatus = "present" | "missing" | "merged" | "ambiguous";

export type SdsFindingSeverity = "info" | "warning" | "critical";

export type SdsFindingCategory =
  | "section_completeness"
  | "freshness"
  | "identity_contact"
  | "hazard_identification"
  | "composition"
  | "ppe_exposure"
  | "handling_storage"
  | "fire_spill_disposal"
  | "transport"
  | "california_ehs_implication"
  | "consistency";

export type SdsDocumentInput = {
  name: string;
  type: "sds";
  text: string;
  source_type?: SdsSourceType;
  retention?: SdsRetention;
  text_extraction_status?: SdsTextExtractionStatus;
};

export type SdsDocument = {
  id: string;
  run_id: string;
  name: string;
  source_type: SdsSourceType;
  retention: SdsRetention;
  extracted_text: string;
  text_extraction_status: SdsTextExtractionStatus;
};

export type SdsSectionMap = {
  document_id: string;
  sections: Array<{
    section_number: number;
    heading: string;
    text: string;
    confidence: number;
    status: SdsSectionStatus;
  }>;
};

export type SdsFinding = {
  id: string;
  severity: SdsFindingSeverity;
  category: SdsFindingCategory;
  title: string;
  reason: string;
  source_section?: number;
  quote?: string;
};

export type PermitHandoffFact = {
  field: string;
  value: string | number | boolean | null;
  source_section: number;
  quote: string;
  confidence: number;
  review_flag: boolean;
  reason: string;
};

export type SdsHandoffRef = PermitHandoffFact & {
  document_id: string;
  document_name: string;
};

export type SdsReview = {
  document: SdsDocument;
  section_map: SdsSectionMap;
  overall_status: SdsOverallStatus;
  quality_findings: SdsFinding[];
  safety_findings: SdsFinding[];
  permit_handoff_facts: PermitHandoffFact[];
};

export type ClientSdsExtraction = {
  name: string;
  source_type: SdsSourceType;
  text: string;
  text_extraction_status: SdsTextExtractionStatus;
};
