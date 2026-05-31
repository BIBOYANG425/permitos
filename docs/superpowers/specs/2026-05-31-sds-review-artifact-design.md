# SDS Review Artifact Design

## Goal

Add a separate Safety Data Sheet (SDS) review artifact to PermitPilot. The artifact reviews uploaded or pasted SDS content for quality, completeness, and EHS implications, then hands structured candidate facts into the permit harness without directly creating verified permit determinations.

The product boundary is intentionally conservative: this is human-review support, not legal advice, SDS authoring, or an authoritative toxicology/classification audit.

## Scope

V1 supports:

- PDF upload and pasted SDS text.
- U.S. OSHA HazCom/GHS-oriented SDS review.
- California/EHS implication flags tied to PermitPilot's current SoCal wedge.
- Ephemeral original-file handling by default.
- Optional user-controlled save-for-audit behavior.

V1 does not support:

- OCR for scanned image-only SDS files.
- Multi-jurisdiction SDS authoring or classification.
- Recalculating hazard classifications from first principles.
- Treating SDS content as verified law.
- Directly writing final permit determinations from SDS findings.

## Standards Grounding

Use OSHA Hazard Communication materials as the baseline for SDS structure. OSHA guidance describes the standardized 16-section SDS format, and OSHA's 2024 HazCom final rule is the current rule context for labels and safety data sheets.

Primary references:

- OSHA Hazard Communication Standard: Safety Data Sheets: https://www.osha.gov/sites/default/files/publications/OSHA3514.pdf
- OSHA Hazard Communication Standard final rule, published May 20, 2024, effective July 19, 2024: https://www.osha.gov/laws-regs/federalregister/2024-05-20

## Product Output

Each SDS review produces an `SdsReview` artifact with three top-level sections.

### 1. Quality Review

Checks:

- 16-section completeness.
- Missing, merged, duplicated, or unreadable sections.
- Revision/preparation date presence and apparent staleness.
- Product identity.
- Supplier/manufacturer identity.
- Emergency phone or emergency contact.
- Basic GHS/HazCom fields where present.

Possible statuses:

- `complete`
- `incomplete`
- `stale`
- `unreadable`
- `needs_expert_review`

### 2. Safety Review

Checks and extracts:

- Signal word, hazard statements, precautionary statements, pictograms, and hazard classes when present.
- Ingredients, CAS numbers, and percent ranges when present.
- PPE and exposure controls.
- Handling and storage.
- Incompatibilities.
- Fire-fighting measures.
- Spill and accidental release measures.
- Disposal considerations.
- Transport information.

The reviewer should flag contradictions, missing safety-critical fields, and ambiguity. It should not silently resolve conflicts or infer classifications beyond the SDS text.

### 3. Permit Handoff

The SDS review emits `PermitHandoffFacts`: structured candidate facts that may affect the existing permit review. These facts can inform intake/planning, but they are not trusted legal determinations.

Candidate flags include:

- HMBP/hazardous material inventory review.
- Flammable liquid or fire-code hazmat storage review.
- VOC or air-emissions review.
- Hazardous waste review.
- Incompatible storage review.
- Spill, stormwater, or secondary containment review.
- Emergency planning or human-review escalation.

Each handoff fact must include:

- `field`
- `value`
- `source_section`
- `quote`
- `confidence`
- `review_flag`
- `reason`

## Data Model

```ts
type SdsDocument = {
  id: string;
  run_id: string;
  name: string;
  source_type: "pdf" | "pasted_text";
  retention: "ephemeral" | "save_for_audit";
  extracted_text: string;
  text_extraction_status: "ok" | "empty" | "unreadable" | "needs_pasted_text";
};

type SdsSectionMap = {
  document_id: string;
  sections: Array<{
    section_number: number;
    heading: string;
    text: string;
    confidence: number;
    status: "present" | "missing" | "merged" | "ambiguous";
  }>;
};

type SdsFinding = {
  id: string;
  severity: "info" | "warning" | "critical";
  category:
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
  title: string;
  reason: string;
  source_section?: number;
  quote?: string;
};

type PermitHandoffFact = {
  field: string;
  value: string | number | boolean | null;
  source_section: number;
  quote: string;
  confidence: number;
  review_flag: boolean;
  reason: string;
};

type SdsReview = {
  document_id: string;
  overall_status: "complete" | "incomplete" | "stale" | "unreadable" | "needs_expert_review";
  quality_findings: SdsFinding[];
  safety_findings: SdsFinding[];
  permit_handoff_facts: PermitHandoffFact[];
};
```

## Harness Boundary

Add an SDS-specific agent role and skill-like capability:

- Role: `sds_reviewer`
- Purpose: parse SDS content, map sections, review completeness/quality, extract safety facts, and emit controlled permit handoff facts.

Allowed tools:

- `parse_sds_text`
- `map_sds_sections`
- `validate_sds_section_completeness`
- `extract_sds_hazard_fields`
- `extract_sds_storage_fields`
- `extract_sds_disposal_transport_fields`
- `flag_sds_inconsistencies`
- `emit_permit_handoff_facts`
- Universal harness tools: `log_step`, `emit_trace_event`, `validate_artifact_schema`, `send_message`, `escalate_to_human`

Blocked behavior:

- No direct final permit determinations.
- No memory writes.
- No trusted law writes.
- No external classification recalculation in V1.
- No automatic form selection.

The existing permit planner may consume `PermitHandoffFacts` as additional intake evidence. Permit determinations still require the normal research/verifier path for regulatory claims.

## Flow

```text
user uploads PDF or pastes SDS text
  -> create SdsDocument
  -> extract text or request pasted fallback
  -> map sections 1-16
  -> create SdsSectionMap
  -> run SDS quality and safety checks
  -> create SdsReview
  -> emit PermitHandoffFacts
  -> planner consumes candidate facts
  -> normal permit research/verifier pipeline decides applicability
```

## Error Handling

- PDF has no extractable text: return `text_extraction_status = "needs_pasted_text"` and show a paste-text fallback.
- Missing sections: keep the SDS artifact visible and list the exact missing section numbers.
- Merged or ambiguous sections: mark `ambiguous`, preserve extracted text, and set `needs_expert_review` if safety-critical fields are affected.
- Stale or missing revision date: flag as `stale` or `needs_expert_review`, not a hard failure.
- Conflicting fields: emit a consistency finding and avoid choosing a winner.
- Proprietary redactions: record uncertainty and avoid extrapolating hidden composition.
- Classification uncertainty: flag `needs_expert_review`; do not fabricate a pass/fail.

## UI Shape

Show the SDS review as a sibling artifact to the permit matrix:

- SDS card per uploaded/pasted document.
- Status badge: complete, incomplete, stale, unreadable, needs expert review.
- Quality findings list.
- Safety findings list.
- Permit handoff facts list.
- Retention indicator: ephemeral or saved for audit.

The permit matrix should show when a row was influenced by SDS handoff facts, but it must distinguish that from verified regulatory evidence.

## Testing

Unit tests:

- Complete SDS fixture maps all 16 sections.
- Missing-sections fixture produces `incomplete`.
- Stale-date fixture produces `stale`.
- Pasted text works without PDF parsing.
- Empty/unreadable extraction requests pasted fallback.
- Incompatible storage terms produce a safety finding.
- California/EHS handoff flags are emitted with quotes and source sections.
- SDS handoff cannot directly create a verified permit row.
- `sds_reviewer` tool scope rejects final-determination and memory-write tools.

Integration tests:

- Research run with SDS handoff still routes through normal planner/verifier.
- Permit matrix shows candidate SDS influence separately from verified legal evidence.
- Save-for-audit retention is opt-in; default is ephemeral.

## Acceptance Criteria

- A user can upload a PDF SDS or paste SDS text.
- The system produces a separate SDS review artifact.
- Missing/stale/inconsistent SDS content remains visible and reviewable.
- The artifact emits candidate permit handoff facts with quotes and section references.
- Permit rows are not automatically verified from SDS facts alone.
- Original uploaded SDS files are not retained unless the user opts into save-for-audit.
- Tests prove SDS findings cannot bypass the permit harness.
