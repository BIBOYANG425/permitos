import { mapSdsSections, normalizeText } from "./sectionMap";
import type {
  PermitHandoffFact,
  SdsDocument,
  SdsDocumentInput,
  SdsFinding,
  SdsFindingCategory,
  SdsFindingSeverity,
  SdsRetention,
  SdsReview,
  SdsSectionMap,
  SdsSourceType,
  SdsTextExtractionStatus,
} from "./types";

type Term = string | RegExp;

type SafetyRule = {
  id: string;
  sourceSection: number;
  category: SdsFindingCategory;
  title: string;
  reason: string;
  terms: Term[];
  severity?: SdsFindingSeverity;
};

type PermitHandoffRule = {
  field: string;
  sourceSection: number;
  terms: Term[];
  reason: string;
};

const SOURCE_TYPES: SdsSourceType[] = ["pdf", "pasted_text"];
const RETENTION_VALUES: SdsRetention[] = ["ephemeral", "save_for_audit"];
const EXTRACTION_STATUSES: SdsTextExtractionStatus[] = ["ok", "empty", "unreadable", "needs_pasted_text"];

export type SdsReviewOptions = {
  asOfDate: Date;
};

const QUALITY_RULE_IDS = {
  unreadableText: "quality_unreadable_text",
  missingSections: "quality_missing_sections",
  allSectionsFound: "quality_all_sections_found",
  ambiguousOrMergedSections: "quality_ambiguous_or_merged_sections",
  productIdentity: "quality_product_identity",
  supplierEmergencyContact: "quality_supplier_emergency_contact",
  revisionDateMissing: "quality_revision_date_missing",
  revisionDateStale: "quality_revision_date_stale",
} as const;

const SAFETY_RULES: SafetyRule[] = [
  {
    id: "hazard_identification",
    sourceSection: 2,
    category: "hazard_identification",
    title: "Hazard identification terms found",
    reason: "Section 2 identifies physical or health hazards that may affect permit scoping.",
    terms: ["highly flammable liquid and vapor", "flammable liquid", "eye irritation", "pictograms", "danger"],
  },
  {
    id: "composition",
    sourceSection: 3,
    category: "composition",
    title: "Composition and CAS identifiers found",
    reason: "Section 3 lists ingredients or CAS numbers useful for inventory and threshold review.",
    terms: ["CAS", "Acetone", "Toluene"],
  },
  {
    id: "handling_storage",
    sourceSection: 7,
    category: "handling_storage",
    title: "Storage incompatibility terms found",
    reason: "Section 7 includes storage conditions or incompatible storage cues.",
    terms: ["away from oxidizers and acids", "flammable liquid storage cabinet", "ignition sources", "oxidizers"],
  },
  {
    id: "ppe_exposure",
    sourceSection: 8,
    category: "ppe_exposure",
    title: "PPE and exposure control terms found",
    reason: "Section 8 identifies personal protective equipment or exposure control expectations.",
    terms: ["local exhaust ventilation", "nitrile gloves", "goggles", "exposure limits"],
  },
  {
    id: "fire_spill_disposal",
    sourceSection: 13,
    category: "fire_spill_disposal",
    title: "Hazardous waste disposal terms found",
    reason: "Section 13 includes disposal language relevant to hazardous waste review.",
    terms: ["hazardous waste", "dispose", "disposal"],
  },
  {
    id: "transport",
    sourceSection: 14,
    category: "transport",
    title: "Transport classification terms found",
    reason: "Section 14 includes transport classification details relevant to handling and shipping.",
    terms: ["UN1993", "Class 3", "Packing Group", "flammable liquids"],
  },
  {
    id: "california_ehs_implication",
    sourceSection: 15,
    category: "california_ehs_implication",
    title: "California EHS implication terms found",
    reason: "Section 15 includes California regulatory terms that should be handed to EHS review.",
    terms: ["California Proposition 65", "Prop 65", "CUPA", "Title 22", "DTSC", "Cal OSHA", "California"],
  },
];

const PERMIT_HANDOFF_RULES: PermitHandoffRule[] = [
  {
    field: "hazardous_material_inventory_review",
    sourceSection: 2,
    terms: ["highly flammable liquid and vapor", "flammable liquid", "danger", "pictograms"],
    reason: "Hazard terms indicate the material may belong in hazardous material inventory review.",
  },
  {
    field: "flammable_liquid_storage_review",
    sourceSection: 7,
    terms: ["flammable liquid storage cabinet", "ignition sources", "flammable liquid"],
    reason: "Storage language identifies flammable liquid cabinet or ignition-source controls.",
  },
  {
    field: "voc_air_emissions_review",
    sourceSection: 9,
    terms: ["VOC content", "volatile", "flash point", "vapor pressure"],
    reason: "Physical property data indicates potential VOC or air-emissions relevance.",
  },
  {
    field: "incompatible_storage_review",
    sourceSection: 10,
    terms: ["Incompatible materials", "strong oxidizers", "strong acids", "reactivity"],
    reason: "Reactivity or incompatible material language indicates segregation review is needed.",
  },
  {
    field: "hazardous_waste_review",
    sourceSection: 13,
    terms: ["hazardous waste", "dispose", "disposal"],
    reason: "Disposal language indicates hazardous waste review may be needed.",
  },
  {
    field: "spill_stormwater_containment_review",
    sourceSection: 6,
    terms: ["storm drains", "waterways", "contain spill", "containment", "spill"],
    reason: "Spill language indicates stormwater or containment review may be needed.",
  },
  {
    field: "california_ehs_review",
    sourceSection: 15,
    terms: ["California Proposition 65", "Prop 65", "Cal OSHA", "Title 22", "DTSC", "CUPA", "California"],
    reason: "California-specific regulatory terms indicate state EHS review may be needed.",
  },
];

export function createSdsDocument(input: SdsDocumentInput, runId: string, index: number): SdsDocument {
  const extractedText = normalizeText(input.text);
  const sourceType = input.source_type ?? "pasted_text";

  return {
    id: `${runId}_sds_${index + 1}`,
    run_id: runId,
    name: input.name,
    source_type: sourceType,
    retention: input.retention ?? "ephemeral",
    extracted_text: extractedText,
    text_extraction_status: input.text_extraction_status ?? inferTextExtractionStatus(sourceType, extractedText),
  };
}

export function reviewSdsInputs(documents: unknown[], runId: string, options: SdsReviewOptions): SdsReview[] {
  const asOfDate = requireAsOfDate(options);

  return documents
    .filter(isSdsDocumentInput)
    .map((input, index) => reviewSdsDocument(createSdsDocument(input, runId, index), { asOfDate }));
}

export function reviewSdsDocument(document: SdsDocument, options: SdsReviewOptions): SdsReview {
  const asOfDate = requireAsOfDate(options);

  if (document.text_extraction_status !== "ok" || document.extracted_text.length === 0) {
    return reviewUnreadableSdsDocument(document);
  }

  const sectionMap = mapSdsSections(document.id, document.extracted_text);
  const qualityFindings = buildQualityFindings(document, sectionMap, asOfDate);
  const safetyFindings = buildSafetyFindings(document, sectionMap);
  const permitHandoffFacts = buildPermitHandoffFacts(sectionMap);

  return {
    document,
    section_map: sectionMap,
    overall_status: determineOverallStatus(qualityFindings, safetyFindings),
    quality_findings: qualityFindings,
    safety_findings: safetyFindings,
    permit_handoff_facts: permitHandoffFacts,
  };
}

function reviewUnreadableSdsDocument(document: SdsDocument): SdsReview {
  return {
    document,
    section_map: mapSdsSections(document.id, ""),
    overall_status: "unreadable",
    quality_findings: [
      {
        id: qualityFindingId(document.id, QUALITY_RULE_IDS.unreadableText),
        severity: "critical",
        category: "section_completeness",
        title: "SDS text could not be extracted",
        reason: "The document has no readable SDS text, so section mapping and safety review cannot be completed.",
      },
    ],
    safety_findings: [],
    permit_handoff_facts: [],
  };
}

function buildQualityFindings(document: SdsDocument, sectionMap: SdsSectionMap, asOfDate: Date): SdsFinding[] {
  const findings: SdsFinding[] = [];
  const missingSections = sectionMap.sections.filter((section) => section.status === "missing");
  const ambiguousOrMergedSections = sectionMap.sections.filter(
    (section) => section.status === "ambiguous" || section.status === "merged",
  );
  const section1Text = sectionText(sectionMap, 1);

  if (missingSections.length > 0) {
    findings.push({
      id: qualityFindingId(document.id, QUALITY_RULE_IDS.missingSections),
      severity: "critical",
      category: "section_completeness",
      title: "Missing SDS sections",
      reason: `SDS section map is missing section(s): ${missingSections
        .map((section) => section.section_number)
        .join(", ")}.`,
    });
  } else {
    findings.push({
      id: qualityFindingId(document.id, QUALITY_RULE_IDS.allSectionsFound),
      severity: "info",
      category: "section_completeness",
      title: "All 16 SDS sections found",
      reason: "The SDS includes headings for all OSHA-style sections 1 through 16.",
    });
  }

  if (ambiguousOrMergedSections.length > 0) {
    findings.push({
      id: qualityFindingId(document.id, QUALITY_RULE_IDS.ambiguousOrMergedSections),
      severity: "warning",
      category: "section_completeness",
      title: "Ambiguous or merged SDS sections",
      reason: `Section(s) ${ambiguousOrMergedSections
        .map((section) => section.section_number)
        .join(", ")} may need manual review for duplicate or insufficient section text.`,
    });
  }

  if (!/\b(product\s*(identifier|name)|trade\s*name|chemical\s*name)\b/i.test(section1Text)) {
    findings.push({
      id: qualityFindingId(document.id, QUALITY_RULE_IDS.productIdentity),
      severity: "warning",
      category: "identity_contact",
      title: "Product identity not clearly labeled",
      reason: "Section 1 does not clearly label a product identifier, product name, trade name, or chemical name.",
      source_section: 1,
    });
  }

  const hasSupplier = /\b(manufacturer|supplier|responsible party|company name)\b/i.test(section1Text);
  const hasEmergencyContact = /\b(emergency\s*(phone|telephone|contact|number)|chemtrec)\b/i.test(section1Text);
  if (!hasSupplier || !hasEmergencyContact) {
    findings.push({
      id: qualityFindingId(document.id, QUALITY_RULE_IDS.supplierEmergencyContact),
      severity: "warning",
      category: "identity_contact",
      title: "Supplier or emergency contact may be missing",
      reason: "Section 1 does not clearly include both supplier/manufacturer and emergency contact information.",
      source_section: 1,
    });
  }

  const revisionDates = findRevisionDates(document.extracted_text);
  if (revisionDates.length === 0) {
    findings.push({
      id: qualityFindingId(document.id, QUALITY_RULE_IDS.revisionDateMissing),
      severity: "warning",
      category: "freshness",
      title: "Revision date not found",
      reason: "No revision, prepared, or issue date could be identified in the SDS text.",
    });
  } else if (isStaleRevisionDate(latestDate(revisionDates), asOfDate)) {
    findings.push({
      id: qualityFindingId(document.id, QUALITY_RULE_IDS.revisionDateStale),
      severity: "warning",
      category: "freshness",
      title: "SDS revision date appears stale",
      reason: "The latest identified SDS revision, prepared, or issue date is older than 3 years.",
    });
  }

  return findings;
}

function buildSafetyFindings(document: SdsDocument, sectionMap: SdsSectionMap): SdsFinding[] {
  const findings: SdsFinding[] = [];

  for (const rule of SAFETY_RULES) {
    const quote = findQuote(evidenceSectionText(sectionMap, rule.sourceSection), rule.terms);
    if (!quote) {
      continue;
    }

    findings.push({
      id: `${document.id}_safety_${rule.id}`,
      severity: rule.severity ?? "warning",
      category: rule.category,
      title: rule.title,
      reason: rule.reason,
      source_section: rule.sourceSection,
      quote,
    });
  }

  return findings;
}

function buildPermitHandoffFacts(sectionMap: SdsSectionMap): PermitHandoffFact[] {
  const facts: PermitHandoffFact[] = [];

  for (const rule of PERMIT_HANDOFF_RULES) {
    const quote = findQuote(evidenceSectionText(sectionMap, rule.sourceSection), rule.terms);
    if (!quote) {
      continue;
    }

    facts.push({
      field: rule.field,
      value: true,
      source_section: rule.sourceSection,
      quote,
      confidence: 0.85,
      review_flag: true,
      reason: rule.reason,
    });
  }

  return facts;
}

function determineOverallStatus(
  qualityFindings: SdsFinding[],
  safetyFindings: SdsFinding[],
): SdsReview["overall_status"] {
  if (hasFindingRule(qualityFindings, QUALITY_RULE_IDS.missingSections)) {
    return "incomplete";
  }

  if (
    hasFindingRule(qualityFindings, QUALITY_RULE_IDS.ambiguousOrMergedSections) ||
    safetyFindings.some((finding) => finding.severity === "critical")
  ) {
    return "needs_expert_review";
  }

  if (hasFindingRule(qualityFindings, QUALITY_RULE_IDS.revisionDateStale)) {
    return "stale";
  }

  return "complete";
}

function requireAsOfDate(options: SdsReviewOptions | undefined): Date {
  if (!options?.asOfDate || Number.isNaN(options.asOfDate.getTime())) {
    throw new Error("asOfDate is required");
  }

  return options.asOfDate;
}

function inferTextExtractionStatus(sourceType: SdsSourceType, extractedText: string): SdsTextExtractionStatus {
  if (extractedText.length > 0) {
    return "ok";
  }

  return sourceType === "pdf" ? "needs_pasted_text" : "empty";
}

function qualityFindingId(documentId: string, ruleId: (typeof QUALITY_RULE_IDS)[keyof typeof QUALITY_RULE_IDS]): string {
  return `${documentId}_${ruleId}`;
}

function hasFindingRule(
  findings: SdsFinding[],
  ruleId: (typeof QUALITY_RULE_IDS)[keyof typeof QUALITY_RULE_IDS],
): boolean {
  return findings.some((finding) => finding.id.endsWith(`_${ruleId}`));
}

function sectionText(sectionMap: SdsSectionMap, sectionNumber: number): string {
  return sectionMap.sections.find((section) => section.section_number === sectionNumber)?.text ?? "";
}

function evidenceSectionText(sectionMap: SdsSectionMap, sectionNumber: number): string {
  const section = sectionMap.sections.find((candidate) => candidate.section_number === sectionNumber);
  if (!section || section.status === "ambiguous" || section.status === "merged") {
    return "";
  }

  return section.text;
}

function findQuote(text: string, terms: Term[]): string | undefined {
  const normalizedText = normalizeText(text);
  if (normalizedText.length === 0) {
    return undefined;
  }

  const chunks = normalizedText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const term of terms) {
    const matcher = typeof term === "string" ? new RegExp(escapeRegExp(term), "i") : term;
    const chunk = chunks.find((candidate) => matcher.test(candidate));
    if (chunk) {
      return chunk.length > 240 ? `${chunk.slice(0, 237)}...` : chunk;
    }
  }

  return undefined;
}

function findRevisionDates(text: string): Date[] {
  const matches = text.matchAll(
    /\b(?:revision|revised|prepared|preparation|issue|issued)\s*(?:date)?\s*[:=-]?\s*((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi,
  );
  const dates: Date[] = [];

  for (const match of matches) {
    const parsed = new Date(match[1]);
    if (!Number.isNaN(parsed.getTime())) {
      dates.push(parsed);
    }
  }

  return dates;
}

function latestDate(dates: Date[]): Date {
  return dates.reduce((latest, date) => (date.getTime() > latest.getTime() ? date : latest), dates[0]);
}

function isStaleRevisionDate(date: Date, asOfDate: Date): boolean {
  const cutoff = new Date(asOfDate.getTime());
  cutoff.setFullYear(cutoff.getFullYear() - 3);
  return date.getTime() < cutoff.getTime();
}

function isSdsDocumentInput(value: unknown): value is SdsDocumentInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SdsDocumentInput>;
  return (
    candidate.type === "sds" &&
    typeof candidate.name === "string" &&
    typeof candidate.text === "string" &&
    isOptionalAllowed(candidate.source_type, SOURCE_TYPES) &&
    isOptionalAllowed(candidate.retention, RETENTION_VALUES) &&
    isOptionalAllowed(candidate.text_extraction_status, EXTRACTION_STATUSES)
  );
}

function isOptionalAllowed<T extends string>(value: unknown, allowedValues: T[]): value is T | undefined {
  return value === undefined || allowedValues.includes(value as T);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
