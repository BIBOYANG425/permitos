# SDS Review Artifact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate Safety Data Sheet review artifact that accepts uploaded or pasted SDS content, flags SDS quality and safety issues, emits candidate permit handoff facts, and prevents those facts from bypassing the normal permit research and verifier path.
**Architecture:** Client SDS inputs extract text before submitting the existing JSON run request. The server creates SDS review artifacts before research planning, augments the scope only with review-flagged candidate facts, and returns `sds_reviews` beside the permit matrix. The harness catalog and runtime add an `sds_reviewer` role whose tools can parse, map, review, and emit handoff facts, but cannot write final determinations, memory updates, form choices, or trusted legal source state.
**Tech Stack:** Next.js App Router, React, Zustand, TypeScript, Vitest, Testing Library, existing research pipeline, `pdfjs-dist` for client-side text PDF extraction.

---

## Current State And Constraints

- The SDS product spec is saved at `docs/superpowers/specs/2026-05-31-sds-review-artifact-design.md`.
- `ResearchRunInput.demo_documents` already accepts document objects, but the research pipeline ignores them.
- `toolCatalog.ts` has a harness catalog contract, but this branch does not currently have `src/lib/research/harness.ts` runtime enforcement.
- If the working tree contains unrelated UI edits, preserve them when touching UI files.
- Original SDS files must remain ephemeral by default. The app should submit extracted text and metadata, not persist uploaded binary files.

## File Map

Create:

- `src/lib/sds/types.ts`
- `src/lib/sds/sectionMap.ts`
- `src/lib/sds/reviewer.ts`
- `src/lib/sds/clientExtraction.ts`
- `src/lib/sds/__tests__/reviewer.test.ts`
- `src/lib/sds/__tests__/clientExtraction.test.ts`
- `src/lib/research/harness.ts`
- `src/lib/research/__tests__/harnessRuntime.test.ts`
- `src/lib/research/__tests__/sdsRun.test.ts`
- `app/components/SdsDocumentPicker.tsx`
- `app/components/SdsReviewPanel.tsx`
- `app/components/__tests__/SdsDocumentPicker.test.tsx`
- `app/components/__tests__/SdsReviewPanel.test.tsx`

Modify:

- `package.json`
- `pnpm-lock.yaml`
- `src/lib/research/types.ts`
- `src/lib/research/toolCatalog.ts`
- `src/lib/research/__tests__/toolCatalog.test.ts`
- `src/lib/research/scope.ts`
- `src/lib/research/run.ts`
- `src/lib/research/synthesis.ts`
- `app/api/research/run/route.ts`
- `app/components/InputPanel.tsx`
- `app/components/IntakeChat.tsx`
- `app/components/SidePanel.tsx`

## Task 1: Add SDS Dependency And Domain Types

- [ ] Run dependency install:

```bash
pnpm add pdfjs-dist
```

- [ ] Create `src/lib/sds/types.ts`:

```ts
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
```

- [ ] Modify `src/lib/research/types.ts`:

Add this import under the existing imports:

```ts
import type { PermitHandoffFact, SdsDocumentInput, SdsReview } from "@/lib/sds/types";
```

Add `"sds_handoff"` to `ProjectFact["source"]`:

```ts
export type ProjectFact = {
  field: string;
  value: unknown;
  source: "intake" | "seeded_demo" | "derived" | "missing" | "sds_handoff";
};
```

Add optional SDS influence metadata to `Determination`:

```ts
  sds_handoff_refs?: PermitHandoffFact[];
```

Add SDS reviews to `ResearchRun` after `scope_pack`:

```ts
  sds_reviews: SdsReview[];
```

Replace the `demo_documents` item type in `ResearchRunInput` with:

```ts
  demo_documents?: Array<
    | SdsDocumentInput
    | {
        name: string;
        type: "tds" | "permit" | "equipment_spec" | "other" | string;
        text: string;
      }
  >;
```

- [ ] Run:

```bash
pnpm typecheck
```

Expected result: typecheck may fail until subsequent tasks populate `sds_reviews` in test run fixtures and runtime `ResearchRun` objects.

## Task 2: Build SDS Section Mapping And Review Logic With Tests First

- [ ] Create `src/lib/sds/__tests__/reviewer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSdsDocument, reviewSdsDocument, reviewSdsInputs } from "../reviewer";

const COMPLETE_SDS = `
Section 1: Identification
Product identifier: Acme Solvent 100
Manufacturer: Acme Chemicals
Emergency phone number: 1-800-555-1212
Revision date: January 3, 2025

Section 2: Hazard(s) identification
Signal word: Danger
Hazard statements: Highly flammable liquid and vapor. Causes serious eye irritation.
Precautionary statements: Keep away from heat. Ground and bond container.
Pictograms: Flame, Exclamation mark

Section 3: Composition/information on ingredients
Acetone CAS 67-64-1 40-60%
Toluene CAS 108-88-3 10-20%

Section 4: First-aid measures
Move person to fresh air. Rinse eyes cautiously with water.

Section 5: Fire-fighting measures
Use dry chemical, carbon dioxide, or foam. Vapors may form explosive mixtures.

Section 6: Accidental release measures
Eliminate ignition sources. Prevent entry into waterways and storm drains.

Section 7: Handling and storage
Store in a flammable liquid storage cabinet. Keep away from oxidizers and acids.

Section 8: Exposure controls/personal protection
Use chemical splash goggles and nitrile gloves. Use local exhaust ventilation.

Section 9: Physical and chemical properties
Flash point: -18 C
VOC content: 780 g/L

Section 10: Stability and reactivity
Incompatible materials: strong oxidizers, acids.

Section 11: Toxicological information
May cause drowsiness or dizziness.

Section 12: Ecological information
Avoid release to the environment.

Section 13: Disposal considerations
Dispose as hazardous waste in accordance with federal, state, and local rules.

Section 14: Transport information
UN1993, Flammable liquids, n.o.s., Class 3, PG II.

Section 15: Regulatory information
California Proposition 65: This product can expose you to chemicals including toluene.

Section 16: Other information
Prepared by Acme EHS. Revision date: January 3, 2025.
`;

describe("SDS reviewer", () => {
  it("maps a complete 16-section SDS and emits quality, safety, and permit handoff artifacts", () => {
    const document = createSdsDocument(
      {
        name: "acme-solvent.pdf",
        type: "sds",
        text: COMPLETE_SDS,
        source_type: "pdf",
        retention: "ephemeral",
        text_extraction_status: "ok"
      },
      "run_sds",
      0
    );

    const review = reviewSdsDocument(document);

    expect(review.overall_status).toBe("complete");
    expect(review.section_map.sections).toHaveLength(16);
    expect(review.section_map.sections.every((section) => section.status === "present")).toBe(true);
    expect(review.quality_findings.find((finding) => finding.title === "All 16 SDS sections found")).toBeDefined();
    expect(review.safety_findings.some((finding) => finding.category === "handling_storage")).toBe(true);
    expect(review.permit_handoff_facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "hazardous_material_inventory_review",
          value: true,
          source_section: 2,
          review_flag: true
        }),
        expect.objectContaining({
          field: "flammable_liquid_storage_review",
          value: true,
          source_section: 7,
          review_flag: true
        }),
        expect.objectContaining({
          field: "voc_air_emissions_review",
          value: true,
          source_section: 9,
          review_flag: true
        }),
        expect.objectContaining({
          field: "hazardous_waste_review",
          value: true,
          source_section: 13,
          review_flag: true
        })
      ])
    );
  });

  it("flags missing SDS sections without hiding the artifact", () => {
    const text = COMPLETE_SDS.replace(/Section 8:[\\s\\S]*?Section 9:/, "Section 9:");
    const review = reviewSdsDocument(createSdsDocument({ name: "missing.txt", type: "sds", text }, "run_sds", 0));

    expect(review.overall_status).toBe("incomplete");
    expect(review.section_map.sections.find((section) => section.section_number === 8)?.status).toBe("missing");
    expect(review.quality_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "section_completeness",
          severity: "critical",
          title: "Missing SDS sections"
        })
      ])
    );
  });

  it("flags stale or missing revision dates", () => {
    const stale = COMPLETE_SDS.replaceAll("January 3, 2025", "January 3, 2018");
    const review = reviewSdsDocument(createSdsDocument({ name: "stale.txt", type: "sds", text: stale }, "run_sds", 0));

    expect(review.overall_status).toBe("stale");
    expect(review.quality_findings.some((finding) => finding.category === "freshness")).toBe(true);
  });

  it("marks empty extracted text as needing pasted text", () => {
    const review = reviewSdsDocument(
      createSdsDocument(
        {
          name: "scan.pdf",
          type: "sds",
          text: "",
          source_type: "pdf",
          text_extraction_status: "needs_pasted_text"
        },
        "run_sds",
        0
      )
    );

    expect(review.overall_status).toBe("unreadable");
    expect(review.document.text_extraction_status).toBe("needs_pasted_text");
    expect(review.quality_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          title: "SDS text could not be extracted"
        })
      ])
    );
  });

  it("extracts incompatible storage and California EHS implication flags with quotes", () => {
    const review = reviewSdsDocument(createSdsDocument({ name: "ca.txt", type: "sds", text: COMPLETE_SDS }, "run_sds", 0));

    expect(review.safety_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "handling_storage",
          title: "Incompatible storage terms found",
          source_section: 7
        }),
        expect.objectContaining({
          category: "california_ehs_implication",
          source_section: 15
        })
      ])
    );
    expect(review.permit_handoff_facts.every((fact) => fact.quote.length > 0)).toBe(true);
    expect(review.permit_handoff_facts.every((fact) => fact.review_flag)).toBe(true);
  });

  it("reviews only SDS demo documents and defaults retention to ephemeral", () => {
    const reviews = reviewSdsInputs(
      [
        { name: "sds.txt", type: "sds", text: COMPLETE_SDS },
        { name: "tds.txt", type: "tds", text: "technical data" }
      ],
      "run_sds"
    );

    expect(reviews).toHaveLength(1);
    expect(reviews[0].document.retention).toBe("ephemeral");
  });
});
```

- [ ] Create `src/lib/sds/sectionMap.ts`:

```ts
import type { SdsSectionMap, SdsSectionStatus } from "./types";

export const SDS_SECTION_HEADINGS: Record<number, string> = {
  1: "Identification",
  2: "Hazard(s) identification",
  3: "Composition/information on ingredients",
  4: "First-aid measures",
  5: "Fire-fighting measures",
  6: "Accidental release measures",
  7: "Handling and storage",
  8: "Exposure controls/personal protection",
  9: "Physical and chemical properties",
  10: "Stability and reactivity",
  11: "Toxicological information",
  12: "Ecological information",
  13: "Disposal considerations",
  14: "Transport information",
  15: "Regulatory information",
  16: "Other information"
};

const SECTION_PATTERN = /^\s*(?:section\s*)?(\d{1,2})\s*[:.)-]?\s*([^\n\r]*)/gim;

export function mapSdsSections(documentId: string, text: string): SdsSectionMap {
  const normalized = normalizeText(text);
  const matches = [...normalized.matchAll(SECTION_PATTERN)]
    .map((match) => ({
      section_number: Number(match[1]),
      heading: match[2].trim(),
      index: match.index ?? 0
    }))
    .filter((match) => match.section_number >= 1 && match.section_number <= 16)
    .sort((a, b) => a.index - b.index);

  const sections = Array.from({ length: 16 }, (_, offset) => {
    const sectionNumber = offset + 1;
    const current = matches.find((match) => match.section_number === sectionNumber);
    const duplicates = matches.filter((match) => match.section_number === sectionNumber);
    const next = current
      ? matches.find((match) => match.index > current.index && match.section_number !== sectionNumber)
      : undefined;
    const textSlice = current
      ? normalized.slice(current.index, next?.index ?? normalized.length).trim()
      : "";
    const status = sectionStatus(current !== undefined, duplicates.length, textSlice);

    return {
      section_number: sectionNumber,
      heading: current?.heading || SDS_SECTION_HEADINGS[sectionNumber],
      text: textSlice,
      confidence: status === "present" ? 0.94 : status === "missing" ? 0 : 0.55,
      status
    };
  });

  return { document_id: documentId, sections };
}

export function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function sectionStatus(found: boolean, duplicateCount: number, text: string): SdsSectionStatus {
  if (!found) return "missing";
  if (duplicateCount > 1) return "ambiguous";
  if (text.length < 20) return "merged";
  return "present";
}
```

- [ ] Create `src/lib/sds/reviewer.ts` with deterministic review logic:

```ts
import type {
  PermitHandoffFact,
  SdsDocument,
  SdsDocumentInput,
  SdsFinding,
  SdsOverallStatus,
  SdsReview
} from "./types";
import { mapSdsSections, normalizeText } from "./sectionMap";

const STALE_YEAR_CUTOFF = 3;

export function createSdsDocument(input: SdsDocumentInput, runId: string, index: number): SdsDocument {
  const extractedText = normalizeText(input.text ?? "");
  const explicitStatus = input.text_extraction_status;
  const inferredStatus = extractedText.length === 0 ? "empty" : "ok";

  return {
    id: `${runId}_sds_${index + 1}`,
    run_id: runId,
    name: input.name,
    source_type: input.source_type ?? "pasted_text",
    retention: input.retention ?? "ephemeral",
    extracted_text: extractedText,
    text_extraction_status: explicitStatus ?? inferredStatus
  };
}

export function reviewSdsInputs(documents: unknown[], runId: string): SdsReview[] {
  return documents
    .filter(isSdsDocumentInput)
    .map((document, index) => reviewSdsDocument(createSdsDocument(document, runId, index)));
}

export function reviewSdsDocument(document: SdsDocument): SdsReview {
  if (document.text_extraction_status !== "ok" || document.extracted_text.trim().length === 0) {
    const section_map = mapSdsSections(document.id, "");
    return {
      document,
      section_map,
      overall_status: "unreadable",
      quality_findings: [
        finding("quality-unreadable", "critical", "section_completeness", "SDS text could not be extracted", "Upload appears empty or image-only. Paste SDS text to continue review.")
      ],
      safety_findings: [],
      permit_handoff_facts: []
    };
  }

  const section_map = mapSdsSections(document.id, document.extracted_text);
  const quality_findings = qualityFindings(section_map, document.extracted_text);
  const safety_findings = safetyFindings(section_map);
  const permit_handoff_facts = permitHandoffFacts(section_map);
  const overall_status = overallStatus(quality_findings, safety_findings);

  return {
    document,
    section_map,
    overall_status,
    quality_findings,
    safety_findings,
    permit_handoff_facts
  };
}

function isSdsDocumentInput(value: unknown): value is SdsDocumentInput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; name?: unknown; text?: unknown };
  return candidate.type === "sds" && typeof candidate.name === "string" && typeof candidate.text === "string";
}

function qualityFindings(sectionMap: SdsReview["section_map"], fullText: string): SdsFinding[] {
  const findings: SdsFinding[] = [];
  const missingSections = sectionMap.sections.filter((section) => section.status === "missing");
  const ambiguousSections = sectionMap.sections.filter((section) => section.status === "ambiguous" || section.status === "merged");
  const revisionDate = extractRevisionDate(fullText);

  if (missingSections.length === 0) {
    findings.push(finding("quality-complete", "info", "section_completeness", "All 16 SDS sections found", "The document includes headings for sections 1 through 16."));
  } else {
    findings.push(finding("quality-missing-sections", "critical", "section_completeness", "Missing SDS sections", `Missing sections: ${missingSections.map((section) => section.section_number).join(", ")}.`));
  }

  if (ambiguousSections.length > 0) {
    findings.push(finding("quality-ambiguous-sections", "warning", "section_completeness", "Ambiguous or merged SDS sections", `Review sections: ${ambiguousSections.map((section) => section.section_number).join(", ")}.`));
  }

  if (!/product (identifier|name)|trade name/i.test(fullText)) {
    findings.push(finding("quality-product-identity", "warning", "identity_contact", "Product identity not clearly labeled", "Section 1 should identify the product or trade name."));
  }

  if (!/(manufacturer|supplier|responsible party)/i.test(fullText) || !/(emergency phone|emergency telephone|24 hour)/i.test(fullText)) {
    findings.push(finding("quality-contact", "warning", "identity_contact", "Supplier or emergency contact may be missing", "Section 1 should include supplier identity and an emergency contact."));
  }

  if (!revisionDate) {
    findings.push(finding("quality-no-revision-date", "warning", "freshness", "Revision date not found", "The review could not locate a preparation, revision, or issue date."));
  } else if (isStale(revisionDate)) {
    findings.push(finding("quality-stale-revision-date", "warning", "freshness", "SDS revision date appears stale", `Located revision date ${revisionDate.toISOString().slice(0, 10)}.`));
  }

  return findings;
}

function safetyFindings(sectionMap: SdsReview["section_map"]): SdsFinding[] {
  const findings: SdsFinding[] = [];
  const section2 = sectionText(sectionMap, 2);
  const section3 = sectionText(sectionMap, 3);
  const section7 = sectionText(sectionMap, 7);
  const section8 = sectionText(sectionMap, 8);
  const section13 = sectionText(sectionMap, 13);
  const section14 = sectionText(sectionMap, 14);
  const section15 = sectionText(sectionMap, 15);

  if (section2 && /(danger|warning|hazard statement|pictogram|flammable|corrosion|toxic)/i.test(section2)) {
    findings.push(finding("safety-hazard-id", "warning", "hazard_identification", "Hazard identification fields found", "Section 2 contains hazard language that should be reviewed before storage or permitting decisions.", 2, quote(section2, /(danger|warning|flammable|corrosion|toxic|hazard statement)[^\n.]*/i)));
  }

  if (section3 && /(cas|%|percent|composition|ingredient)/i.test(section3)) {
    findings.push(finding("safety-composition", "info", "composition", "Composition information found", "Section 3 includes ingredient or CAS information that may affect hazardous material inventory review.", 3, quote(section3, /(cas|%|percent|ingredient)[^\n.]*/i)));
  }

  if (section7 && /(incompatible|oxidizer|acid|base|segregate|flammable liquid storage cabinet)/i.test(section7)) {
    findings.push(finding("safety-storage", "warning", "handling_storage", "Incompatible storage terms found", "Section 7 identifies storage constraints that should be checked against site storage plans.", 7, quote(section7, /(incompatible|oxidizer|acid|base|segregate|flammable liquid storage cabinet)[^\n.]*/i)));
  }

  if (section8 && /(respirator|glove|goggles|local exhaust|ventilation|ppe)/i.test(section8)) {
    findings.push(finding("safety-ppe", "info", "ppe_exposure", "PPE or exposure controls found", "Section 8 identifies controls relevant to operational review.", 8, quote(section8, /(respirator|glove|goggles|local exhaust|ventilation|ppe)[^\n.]*/i)));
  }

  if (section13 && /(hazardous waste|dispose|disposal|rcra)/i.test(section13)) {
    findings.push(finding("safety-disposal", "warning", "fire_spill_disposal", "Disposal review terms found", "Section 13 indicates disposal obligations or hazardous waste review may be needed.", 13, quote(section13, /(hazardous waste|dispose|disposal|rcra)[^\n.]*/i)));
  }

  if (section14 && /(un\d{4}|class\s*3|flammable liquid|packing group)/i.test(section14)) {
    findings.push(finding("safety-transport", "info", "transport", "Transport classification found", "Section 14 contains transport classification information.", 14, quote(section14, /(un\d{4}|class\s*3|flammable liquid|packing group)[^\n.]*/i)));
  }

  if (section15 && /(california|proposition 65|prop 65|cal\/osha|title 22|dtSC|cupa)/i.test(section15)) {
    findings.push(finding("safety-california", "warning", "california_ehs_implication", "California EHS implication found", "Section 15 references California-specific regulatory information.", 15, quote(section15, /(california|proposition 65|prop 65|cal\/osha|title 22|dtsc|cupa)[^\n.]*/i)));
  }

  return findings;
}

function permitHandoffFacts(sectionMap: SdsReview["section_map"]): PermitHandoffFact[] {
  const facts: PermitHandoffFact[] = [];
  addFact(facts, sectionMap, 2, "hazardous_material_inventory_review", /(danger|warning|flammable|corrosive|toxic|oxidizer|hazard statement)/i, "SDS hazard identification indicates hazardous material inventory review may be needed.");
  addFact(facts, sectionMap, 7, "flammable_liquid_storage_review", /(flammable liquid storage|keep away from heat|ground and bond|ignition source)/i, "SDS handling and storage text indicates flammable liquid storage review may be needed.");
  addFact(facts, sectionMap, 9, "voc_air_emissions_review", /(voc|volatile organic|vapor pressure|flash point)/i, "SDS physical properties indicate VOC or air emissions review may be needed.");
  addFact(facts, sectionMap, 10, "incompatible_storage_review", /(incompatible|oxidizer|acid|base|reactive)/i, "SDS stability and reactivity text indicates incompatible storage review may be needed.");
  addFact(facts, sectionMap, 13, "hazardous_waste_review", /(hazardous waste|dispose|disposal|rcra)/i, "SDS disposal text indicates hazardous waste review may be needed.");
  addFact(facts, sectionMap, 6, "spill_stormwater_containment_review", /(spill|release|storm drain|waterway|containment)/i, "SDS accidental release text indicates spill, stormwater, or containment review may be needed.");
  addFact(facts, sectionMap, 15, "california_ehs_review", /(california|proposition 65|prop 65|cal\/osha|title 22|dtsc|cupa)/i, "SDS regulatory information indicates California EHS review may be needed.");
  return facts;
}

function addFact(facts: PermitHandoffFact[], sectionMap: SdsReview["section_map"], sectionNumber: number, field: string, pattern: RegExp, reason: string) {
  const text = sectionText(sectionMap, sectionNumber);
  const matchedQuote = quote(text, pattern);
  if (!matchedQuote) return;
  facts.push({
    field,
    value: true,
    source_section: sectionNumber,
    quote: matchedQuote,
    confidence: 0.78,
    review_flag: true,
    reason
  });
}

function sectionText(sectionMap: SdsReview["section_map"], sectionNumber: number): string {
  return sectionMap.sections.find((section) => section.section_number === sectionNumber)?.text ?? "";
}

function quote(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  const value = match?.[0] ?? "";
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function finding(
  id: string,
  severity: SdsFinding["severity"],
  category: SdsFinding["category"],
  title: string,
  reason: string,
  source_section?: number,
  matchedQuote?: string
): SdsFinding {
  return {
    id,
    severity,
    category,
    title,
    reason,
    source_section,
    quote: matchedQuote || undefined
  };
}

function extractRevisionDate(text: string): Date | null {
  const match = text.match(/(?:revision|prepared|preparation|issue|issued)\s*date\s*[:\-]?\s*([A-Z][a-z]+ \d{1,2}, \d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
  if (!match) return null;
  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isStale(date: Date): boolean {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - STALE_YEAR_CUTOFF);
  return date < cutoff;
}

function overallStatus(qualityFindings: SdsFinding[], safetyFindings: SdsFinding[]): SdsOverallStatus {
  if (qualityFindings.some((finding) => finding.id === "quality-missing-sections")) return "incomplete";
  if (qualityFindings.some((finding) => finding.id === "quality-stale-revision-date")) return "stale";
  if (qualityFindings.some((finding) => finding.id === "quality-ambiguous-sections")) return "needs_expert_review";
  if (safetyFindings.some((finding) => finding.severity === "critical")) return "needs_expert_review";
  return "complete";
}
```

- [ ] Run:

```bash
pnpm test -- src/lib/sds/__tests__/reviewer.test.ts
```

Expected result: all SDS reviewer tests pass.

## Task 3: Add Client SDS Text Extraction

- [ ] Create `src/lib/sds/__tests__/clientExtraction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractSdsTextFromClientFile } from "../clientExtraction";

describe("extractSdsTextFromClientFile", () => {
  it("extracts plain text files as pasted text-compatible SDS input", async () => {
    const file = new File(["Section 1: Identification\nSection 2: Hazard(s) identification"], "sds.txt", { type: "text/plain" });

    const extraction = await extractSdsTextFromClientFile(file);

    expect(extraction).toEqual({
      name: "sds.txt",
      source_type: "pasted_text",
      text: "Section 1: Identification\nSection 2: Hazard(s) identification",
      text_extraction_status: "ok"
    });
  });

  it("returns a pasted text fallback signal when PDF parsing fails", async () => {
    const file = new File(["not a valid pdf"], "scan.pdf", { type: "application/pdf" });

    const extraction = await extractSdsTextFromClientFile(file);

    expect(extraction.name).toBe("scan.pdf");
    expect(extraction.source_type).toBe("pdf");
    expect(extraction.text_extraction_status).toBe("needs_pasted_text");
  });
});
```

- [ ] Create `src/lib/sds/clientExtraction.ts`:

```ts
import type { ClientSdsExtraction } from "./types";

export async function extractSdsTextFromClientFile(file: File): Promise<ClientSdsExtraction> {
  if (isPdf(file)) {
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const data = new Uint8Array(await file.arrayBuffer());
      const loadingTask = pdfjs.getDocument({ data, disableWorker: true });
      const pdf = await loadingTask.promise;
      const pages: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      }

      const text = pages.join("\n").trim();
      return {
        name: file.name,
        source_type: "pdf",
        text,
        text_extraction_status: text.length > 0 ? "ok" : "needs_pasted_text"
      };
    } catch {
      return {
        name: file.name,
        source_type: "pdf",
        text: "",
        text_extraction_status: "needs_pasted_text"
      };
    }
  }

  const text = await file.text();
  return {
    name: file.name,
    source_type: "pasted_text",
    text,
    text_extraction_status: text.trim().length > 0 ? "ok" : "empty"
  };
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
```

- [ ] Run:

```bash
pnpm test -- src/lib/sds/__tests__/clientExtraction.test.ts
```

Expected result: client extraction tests pass in jsdom.

## Task 4: Add Harness Runtime And SDS Tool Scope

- [ ] Create `src/lib/research/__tests__/harnessRuntime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HarnessToolScopeError, createHarnessContext } from "../harness";
import { sdsReviewerToolIds } from "../toolCatalog";

describe("harness runtime", () => {
  it("allows cataloged SDS reviewer tools and records calls", () => {
    const harness = createHarnessContext({
      role: "sds_reviewer",
      allowed_tools: sdsReviewerToolIds(),
      blocked_tools: []
    });

    harness.callTool("map_sds_sections");
    harness.callTool("emit_permit_handoff_facts");

    expect(harness.calls.map((call) => call.tool_id)).toEqual(["map_sds_sections", "emit_permit_handoff_facts"]);
  });

  it("rejects direct final permit determination tools for SDS reviewers", () => {
    const harness = createHarnessContext({
      role: "sds_reviewer",
      allowed_tools: sdsReviewerToolIds(),
      blocked_tools: ["build_applicability_matrix", "verify_determination", "freshness_sweep"]
    });

    expect(() => harness.callTool("build_applicability_matrix")).toThrow(HarnessToolScopeError);
    expect(() => harness.callTool("freshness_sweep")).toThrow(HarnessToolScopeError);
  });
});
```

- [ ] Create `src/lib/research/harness.ts`:

```ts
import type { AgentRole, HarnessToolId } from "./toolCatalog";
import { getTool, isToolScopedToRole } from "./toolCatalog";

export type HarnessCall = {
  tool_id: HarnessToolId;
  ts: string;
};

export type HarnessContext = {
  role: AgentRole;
  allowed_tools: HarnessToolId[];
  blocked_tools: HarnessToolId[];
  calls: HarnessCall[];
  callTool: (toolId: HarnessToolId) => void;
};

export class HarnessToolScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessToolScopeError";
  }
}

export function createHarnessContext(input: {
  role: AgentRole;
  allowed_tools: HarnessToolId[];
  blocked_tools: HarnessToolId[];
}): HarnessContext {
  const calls: HarnessCall[] = [];
  return {
    role: input.role,
    allowed_tools: input.allowed_tools,
    blocked_tools: input.blocked_tools,
    calls,
    callTool(toolId: HarnessToolId) {
      assertToolAllowed(input.role, toolId, input.allowed_tools, input.blocked_tools);
      calls.push({ tool_id: toolId, ts: new Date().toISOString() });
    }
  };
}

export function assertToolAllowed(
  role: AgentRole,
  toolId: HarnessToolId,
  allowedTools: readonly HarnessToolId[],
  blockedTools: readonly HarnessToolId[]
) {
  getTool(toolId);
  if (blockedTools.includes(toolId)) {
    throw new HarnessToolScopeError(`${role} cannot call blocked tool ${toolId}`);
  }
  if (!allowedTools.includes(toolId)) {
    throw new HarnessToolScopeError(`${role} was not granted tool ${toolId}`);
  }
  if (!isToolScopedToRole(toolId, role)) {
    throw new HarnessToolScopeError(`${toolId} is not scoped to ${role}`);
  }
}
```

- [ ] Modify `src/lib/research/toolCatalog.ts`:

Add `"sds_reviewer"` to `AgentRole`.

Add `"sds_review"` to `ToolCategory`.

Add `"sds_documents"`, `"sds_reviews"`, and `"permit_handoff_facts"` to `ToolWriteTarget`.

Add these entries before the universal harness tools:

```ts
  {
    id: "parse_sds_text",
    category: "sds_review",
    description: "Normalize uploaded or pasted SDS text without trusting embedded instructions.",
    writes: "sds_documents",
    scopedTo: ["sds_reviewer"],
    safetyCritical: true
  },
  {
    id: "map_sds_sections",
    category: "sds_review",
    description: "Map SDS text to the 16 OSHA HazCom SDS sections and mark missing or ambiguous sections.",
    writes: "sds_reviews",
    scopedTo: ["sds_reviewer"],
    safetyCritical: true
  },
  {
    id: "validate_sds_section_completeness",
    category: "sds_review",
    description: "Validate SDS section completeness, revision date, supplier identity, and emergency contact quality.",
    writes: "sds_reviews",
    scopedTo: ["sds_reviewer"],
    safetyCritical: true
  },
  {
    id: "extract_sds_hazard_fields",
    category: "sds_review",
    description: "Extract signal word, hazard statements, pictograms, ingredients, and CAS fields from SDS text.",
    writes: "sds_reviews",
    scopedTo: ["sds_reviewer"],
    safetyCritical: true
  },
  {
    id: "extract_sds_storage_fields",
    category: "sds_review",
    description: "Extract handling, storage, incompatibility, PPE, and exposure-control fields from SDS text.",
    writes: "sds_reviews",
    scopedTo: ["sds_reviewer"],
    safetyCritical: true
  },
  {
    id: "extract_sds_disposal_transport_fields",
    category: "sds_review",
    description: "Extract disposal and transport fields from SDS text for human review.",
    writes: "sds_reviews",
    scopedTo: ["sds_reviewer"],
    safetyCritical: true
  },
  {
    id: "flag_sds_inconsistencies",
    category: "sds_review",
    description: "Flag contradictory, stale, redacted, or uncertain SDS statements without resolving them silently.",
    writes: "sds_reviews",
    scopedTo: ["sds_reviewer"],
    safetyCritical: true
  },
  {
    id: "emit_permit_handoff_facts",
    category: "sds_review",
    description: "Emit review-flagged candidate facts for the permit planner without writing final determinations.",
    writes: "permit_handoff_facts",
    scopedTo: ["sds_reviewer"],
    safetyCritical: true
  },
```

Add helper constants near the existing role helpers:

```ts
export const sdsReviewerCoreToolIds = [
  "parse_sds_text",
  "map_sds_sections",
  "validate_sds_section_completeness",
  "extract_sds_hazard_fields",
  "extract_sds_storage_fields",
  "extract_sds_disposal_transport_fields",
  "flag_sds_inconsistencies",
  "emit_permit_handoff_facts"
] as const satisfies readonly HarnessToolId[];

export const blockedSdsReviewerToolIds = [
  "get_form",
  "fetch_source",
  "prove_currency",
  "extract_threshold",
  "verify_determination",
  "verify_determination_set",
  "build_applicability_matrix",
  "generate_compliance_calendar",
  "assemble_review_package",
  "freshness_sweep",
  "propose_map_entry",
  "propose_form_entry"
] as const satisfies readonly HarnessToolId[];

export function sdsReviewerToolIds(): HarnessToolId[] {
  return uniqueToolIds([...universalHarnessToolIds, ...sdsReviewerCoreToolIds]);
}
```

Update `blockedToolIdsForRole`:

```ts
export function blockedToolIdsForRole(role: AgentRole): HarnessToolId[] {
  if (role === "researcher") {
    return [...blockedResearcherToolIds];
  }
  if (role === "sds_reviewer") {
    return [...blockedSdsReviewerToolIds];
  }
  return [];
}
```

- [ ] Modify `src/lib/research/__tests__/toolCatalog.test.ts`:

Add imports:

```ts
  blockedToolIdsForRole,
  sdsReviewerToolIds,
```

Add this test:

```ts
  it("scopes SDS reviewer to SDS artifact tools and blocks final permit writes", () => {
    const reviewerTools = toolIdsForRole("sds_reviewer");
    const allowed = sdsReviewerToolIds();
    const blocked = blockedToolIdsForRole("sds_reviewer");

    expect(allowed).toEqual(
      expect.arrayContaining([
        "parse_sds_text",
        "map_sds_sections",
        "validate_sds_section_completeness",
        "extract_sds_hazard_fields",
        "extract_sds_storage_fields",
        "extract_sds_disposal_transport_fields",
        "flag_sds_inconsistencies",
        "emit_permit_handoff_facts",
        "log_step",
        "validate_artifact_schema"
      ])
    );
    expect(allowed.every((toolId) => reviewerTools.includes(toolId))).toBe(true);
    expect(blocked).toEqual(expect.arrayContaining(["build_applicability_matrix", "verify_determination", "freshness_sweep"]));
    expect(allowed).not.toContain("build_applicability_matrix");
    expect(isToolScopedToRole("emit_permit_handoff_facts", "researcher")).toBe(false);
  });
```

- [ ] Run:

```bash
pnpm test -- src/lib/research/__tests__/toolCatalog.test.ts src/lib/research/__tests__/harnessRuntime.test.ts
```

Expected result: catalog and runtime harness tests pass.

## Task 5: Wire SDS Reviews Into Research Runs Without Bypassing Verification

- [ ] Create `src/lib/research/__tests__/sdsRun.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runResearch } from "../run";

const SDS_TEXT = `
Section 1: Identification
Product identifier: Acme Solvent 100
Manufacturer: Acme Chemicals
Emergency phone number: 1-800-555-1212
Revision date: January 3, 2025
Section 2: Hazard(s) identification
Signal word: Danger
Hazard statements: Highly flammable liquid and vapor.
Section 3: Composition/information on ingredients
Acetone CAS 67-64-1 40-60%
Section 4: First-aid measures
Move person to fresh air.
Section 5: Fire-fighting measures
Use foam.
Section 6: Accidental release measures
Prevent entry into storm drains.
Section 7: Handling and storage
Store in a flammable liquid storage cabinet away from oxidizers.
Section 8: Exposure controls/personal protection
Use goggles and local exhaust ventilation.
Section 9: Physical and chemical properties
VOC content: 780 g/L
Section 10: Stability and reactivity
Incompatible materials: oxidizers.
Section 11: Toxicological information
May cause drowsiness.
Section 12: Ecological information
Avoid release.
Section 13: Disposal considerations
Dispose as hazardous waste.
Section 14: Transport information
UN1993 Class 3.
Section 15: Regulatory information
California Proposition 65 warning.
Section 16: Other information
Revision date: January 3, 2025.
`;

describe("runResearch SDS integration", () => {
  it("returns SDS review artifacts and candidate handoff facts", async () => {
    const run = await runResearch({
      project_description: "Los Angeles coating booth project with solvent storage.",
      demo_documents: [{ name: "acme-sds.txt", type: "sds", text: SDS_TEXT }]
    });

    expect(run.sds_reviews).toHaveLength(1);
    expect(run.sds_reviews[0].permit_handoff_facts.length).toBeGreaterThan(0);
    expect(run.trace_events.some((event) => event.actor === "sds_reviewer" && event.phase === "sds_review")).toBe(true);
  });

  it("does not mark permit determinations verified solely from SDS handoff facts", async () => {
    const run = await runResearch({
      project_description: "Unknown site with missing quantities and SDS only.",
      demo_documents: [{ name: "acme-sds.txt", type: "sds", text: SDS_TEXT }]
    });

    expect(run.sds_reviews[0].permit_handoff_facts.every((fact) => fact.review_flag)).toBe(true);
    expect(run.determinations.every((determination) => !determination.source_url.startsWith("sds:"))).toBe(true);
    expect(run.determinations.every((determination) => determination.verified === true || determination.review_flag === true)).toBe(true);
  });
});
```

- [ ] Modify `src/lib/research/scope.ts`:

Add import:

```ts
import type { PermitHandoffFact, SdsReview } from "@/lib/sds/types";
```

Add a new exported function after `parseScope`:

```ts
export function applySdsHandoffToScope(scope: ScopePack, sdsReviews: SdsReview[]): ScopePack {
  const facts = sdsReviews.flatMap((review) => review.permit_handoff_facts);
  if (facts.length === 0) return scope;

  const next: ScopePack = {
    ...scope,
    project_change: {
      ...scope.project_change,
      chemicals: [...scope.project_change.chemicals],
      waste_streams: [...scope.project_change.waste_streams]
    },
    assumptions: [...scope.assumptions],
    missing_facts: [...scope.missing_facts]
  };

  if (hasFact(facts, "hazardous_material_inventory_review") && next.project_change.chemicals.length === 0) {
    next.project_change.chemicals.push({
      name: "SDS-listed hazardous material",
      quantity: null,
      unit: null,
      hazard: firstQuote(facts, "hazardous_material_inventory_review")
    });
    addMissingFact(next, "chemicals.quantity", "SDS indicates hazardous material review, but inventory quantity is missing.", ["hazmat"]);
  }

  if (hasFact(facts, "hazardous_waste_review") && next.project_change.waste_streams.length === 0) {
    next.project_change.waste_streams.push({
      description: "SDS-indicated hazardous waste stream",
      kg_per_month: null
    });
    addMissingFact(next, "waste_streams.kg_per_month", "SDS indicates hazardous waste review, but monthly generation quantity is missing.", ["waste"]);
  }

  for (const fact of facts) {
    next.assumptions.push({
      claim: `SDS candidate fact: ${fact.field}=${String(fact.value)}`,
      basis: `Section ${fact.source_section}: ${fact.quote}`,
      confidence: fact.confidence
    });
  }

  return next;
}

function hasFact(facts: PermitHandoffFact[], field: string): boolean {
  return facts.some((fact) => fact.field === field && fact.value === true);
}

function firstQuote(facts: PermitHandoffFact[], field: string): string {
  return facts.find((fact) => fact.field === field)?.quote ?? "SDS handoff fact";
}

function addMissingFact(scope: ScopePack, field: string, whyNeeded: string, blocks: string[]) {
  if (scope.missing_facts.some((fact) => fact.field === field)) return;
  scope.missing_facts.push({ field, why_needed: whyNeeded, blocks });
}
```

Update `projectFacts` to expose SDS candidate assumptions:

```ts
    sds_handoff_assumptions: scope.assumptions.filter((assumption) => assumption.claim.startsWith("SDS candidate fact:")),
```

- [ ] Modify `src/lib/research/run.ts`:

Add imports:

```ts
import { reviewSdsInputs } from "@/lib/sds/reviewer";
import { applySdsHandoffToScope, parseScope, createRunId, projectFacts } from "./scope";
```

Replace the existing scope creation block:

```ts
  const base_scope_pack = parseScope(input, run_id);
  const sds_reviews = reviewSdsInputs(input.demo_documents ?? [], run_id);
  for (const review of sds_reviews) {
    trace_events.push(
      trace(
        run_id,
        "sds_reviewer",
        "sds_review",
        review.overall_status === "unreadable" ? "needs_review" : "done",
        `Reviewed SDS ${review.document.name}: ${review.overall_status}`,
        review.document.id
      )
    );
  }
  const scope_pack = applySdsHandoffToScope(base_scope_pack, sds_reviews);
```

Add `sds_reviews` to the `ResearchRun` result:

```ts
    sds_reviews,
```

Add telemetry property:

```ts
    sds_reviews_count: sds_reviews.length,
```

- [ ] Modify `src/lib/research/synthesis.ts`:

Add import:

```ts
import type { SdsReview } from "@/lib/sds/types";
```

Update the exported `synthesize` signature to accept a final optional parameter:

```ts
export function synthesize(
  scope: ScopePack,
  hypotheses: ResearchHypothesis[],
  angles: RegulatoryAngle[],
  evidence: EvidenceBundle[],
  verdicts: VerificationVerdict[],
  sdsReviews: SdsReview[] = []
) {
```

When building each `Determination`, attach matching SDS refs through this helper:

```ts
function sdsRefsForRequirement(requirement: string, sdsReviews: SdsReview[]) {
  const normalized = requirement.toLowerCase();
  return sdsReviews
    .flatMap((review) => review.permit_handoff_facts)
    .filter((fact) => {
      if (normalized.includes("hmbp") || normalized.includes("hazardous material")) {
        return fact.field.includes("hazardous_material") || fact.field.includes("flammable_liquid");
      }
      if (normalized.includes("waste")) {
        return fact.field.includes("waste");
      }
      if (normalized.includes("air") || normalized.includes("scaqmd") || normalized.includes("voc")) {
        return fact.field.includes("voc") || fact.field.includes("air");
      }
      if (normalized.includes("stormwater")) {
        return fact.field.includes("stormwater") || fact.field.includes("spill");
      }
      return false;
    });
}
```

Pass `sds_reviews` from `run.ts`:

```ts
  const synthesis = synthesize(scope_pack, plan.research_graph, plan.regulatory_angles, latestEvidence, latestVerdicts, sds_reviews);
```

- [ ] Modify `app/api/research/run/route.ts` request body type:

```ts
      demo_documents?: Array<{
        name: string;
        type: string;
        text: string;
        source_type?: "pdf" | "pasted_text";
        retention?: "ephemeral" | "save_for_audit";
        text_extraction_status?: "ok" | "empty" | "unreadable" | "needs_pasted_text";
      }>;
```

- [ ] Run:

```bash
pnpm test -- src/lib/research/__tests__/sdsRun.test.ts
```

Expected result: SDS integration tests pass and no determination uses an SDS pseudo-source URL as verified legal evidence.

## Task 6: Add SDS Input UI

- [ ] Create `app/components/__tests__/SdsDocumentPicker.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SdsDocumentPicker } from "../SdsDocumentPicker";

describe("SdsDocumentPicker", () => {
  it("adds pasted SDS text with ephemeral retention by default", () => {
    const onChange = vi.fn();
    render(<SdsDocumentPicker documents={[]} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("SDS text"), { target: { value: "Section 1: Identification" } });
    fireEvent.click(screen.getByText("Add SDS text"));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "Pasted SDS",
        type: "sds",
        source_type: "pasted_text",
        retention: "ephemeral",
        text_extraction_status: "ok"
      })
    ]);
  });

  it("keeps save-for-audit as an explicit opt-in", () => {
    const onChange = vi.fn();
    render(<SdsDocumentPicker documents={[]} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("Save SDS text for audit"));
    fireEvent.change(screen.getByLabelText("SDS text"), { target: { value: "Section 1: Identification" } });
    fireEvent.click(screen.getByText("Add SDS text"));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        retention: "save_for_audit"
      })
    ]);
  });

  it("adds uploaded files through extraction", async () => {
    const onChange = vi.fn();
    render(<SdsDocumentPicker documents={[]} onChange={onChange} />);

    const file = new File(["Section 1: Identification"], "sds.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Upload SDS"), { target: { files: [file] } });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "sds.txt",
          type: "sds",
          source_type: "pasted_text",
          text_extraction_status: "ok"
        })
      ]);
    });
  });
});
```

- [ ] Create `app/components/SdsDocumentPicker.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { SdsDocumentInput, SdsRetention } from "@/lib/sds/types";
import { extractSdsTextFromClientFile } from "@/lib/sds/clientExtraction";
import { FileText, Upload, X } from "lucide-react";

type Props = {
  documents: SdsDocumentInput[];
  onChange: (documents: SdsDocumentInput[]) => void;
};

export function SdsDocumentPicker({ documents, onChange }: Props) {
  const [text, setText] = useState("");
  const [retention, setRetention] = useState<SdsRetention>("ephemeral");
  const [busy, setBusy] = useState(false);

  function addPastedText() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onChange([
      ...documents,
      {
        name: "Pasted SDS",
        type: "sds",
        text: trimmed,
        source_type: "pasted_text",
        retention,
        text_extraction_status: "ok"
      }
    ]);
    setText("");
    setRetention("ephemeral");
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const extracted = await Promise.all(Array.from(files).map((file) => extractSdsTextFromClientFile(file)));
      onChange([
        ...documents,
        ...extracted.map((item) => ({
          name: item.name,
          type: "sds" as const,
          text: item.text,
          source_type: item.source_type,
          retention,
          text_extraction_status: item.text_extraction_status
        }))
      ]);
    } finally {
      setBusy(false);
    }
  }

  function removeAt(index: number) {
    onChange(documents.filter((_, current) => current !== index));
  }

  return (
    <section className="flex flex-col gap-2 border border-slate-800/60 bg-slate-950/35 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="brand-label">SDS review</div>
        <label className="flex cursor-pointer items-center gap-1.5 text-slate-400 hover:text-cyan-300">
          <Upload size={13} />
          <span>Upload</span>
          <input
            aria-label="Upload SDS"
            type="file"
            accept=".pdf,.txt,text/plain,application/pdf"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              void addFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      <textarea
        aria-label="SDS text"
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste SDS text"
        className="w-full resize-y border border-slate-700/40 bg-slate-950/60 p-2 text-slate-100 placeholder:text-slate-500 focus:border-cyan-600/50 focus:outline-none"
      />
      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        <input
          aria-label="Save SDS text for audit"
          type="checkbox"
          checked={retention === "save_for_audit"}
          onChange={(event) => setRetention(event.target.checked ? "save_for_audit" : "ephemeral")}
        />
        Save SDS text for audit
      </label>
      <button
        type="button"
        onClick={addPastedText}
        disabled={!text.trim()}
        className="flex items-center justify-center gap-1.5 bg-slate-800 px-3 py-2 font-semibold text-slate-100 transition-colors hover:bg-slate-700 disabled:cursor-default disabled:opacity-40"
      >
        <FileText size={13} />
        Add SDS text
      </button>
      {documents.length > 0 && (
        <div className="space-y-1">
          {documents.map((document, index) => (
            <div key={`${document.name}-${index}`} className="flex items-center justify-between gap-2 border border-slate-800/60 bg-slate-900/50 px-2 py-1.5">
              <span className="truncate text-slate-300">{document.name}</span>
              <button
                type="button"
                aria-label={`Remove ${document.name}`}
                onClick={() => removeAt(index)}
                className="grid h-6 w-6 place-items-center text-slate-500 hover:text-red-300"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] Modify `app/components/InputPanel.tsx`:

Add imports:

```tsx
import type { SdsDocumentInput } from "@/lib/sds/types";
import { SdsDocumentPicker } from "./SdsDocumentPicker";
```

Add state:

```tsx
  const [sdsDocuments, setSdsDocuments] = useState<SdsDocumentInput[]>([]);
```

Render the picker between the project description textarea and Run button:

```tsx
        <SdsDocumentPicker documents={sdsDocuments} onChange={setSdsDocuments} />
```

Update the run payload:

```tsx
          onClick={() => startRun({ project_description: text, demo_documents: sdsDocuments })}
```

- [ ] Modify `app/components/IntakeChat.tsx`:

Keep the current animation changes. Add the same `SdsDocumentPicker` below the message list so chat-based intake can attach SDS before the run completes. Use local `sdsDocuments` state and pass it into `startRun`:

```tsx
  const [sdsDocuments, setSdsDocuments] = useState<SdsDocumentInput[]>([]);
```

```tsx
        <div className="border-t border-slate-700/40 p-3.5">
          <SdsDocumentPicker documents={sdsDocuments} onChange={setSdsDocuments} />
        </div>
```

```tsx
        void startRun({ project_description: data.project_description, demo_documents: sdsDocuments });
```

- [ ] Run:

```bash
pnpm test -- app/components/__tests__/SdsDocumentPicker.test.tsx
```

Expected result: SDS input tests pass.

## Task 7: Render SDS Review Artifacts

- [ ] Create `app/components/__tests__/SdsReviewPanel.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SdsReviewPanel } from "../SdsReviewPanel";
import { useStore } from "@/lib/ui/store";
import type { ResearchRun } from "@/lib/research/types";

describe("SdsReviewPanel", () => {
  it("renders SDS quality, safety, and permit handoff facts", () => {
    useStore.setState({
      run: {
        run_id: "run_sds",
        status: "needs_review",
        project_facts: {},
        jurisdiction_stack: [],
        scope_pack: {} as never,
        sds_reviews: [
          {
            document: {
              id: "sds1",
              run_id: "run_sds",
              name: "acme-sds.txt",
              source_type: "pasted_text",
              retention: "ephemeral",
              extracted_text: "Section 1",
              text_extraction_status: "ok"
            },
            section_map: { document_id: "sds1", sections: [] },
            overall_status: "incomplete",
            quality_findings: [
              { id: "q1", severity: "critical", category: "section_completeness", title: "Missing SDS sections", reason: "Missing sections: 8." }
            ],
            safety_findings: [
              { id: "s1", severity: "warning", category: "handling_storage", title: "Incompatible storage terms found", reason: "Keep away from oxidizers.", source_section: 7, quote: "Keep away from oxidizers" }
            ],
            permit_handoff_facts: [
              { field: "flammable_liquid_storage_review", value: true, source_section: 7, quote: "flammable liquid storage cabinet", confidence: 0.78, review_flag: true, reason: "Storage review may be needed." }
            ]
          }
        ],
        coverage_family_statuses: [],
        regulatory_angles: [],
        research_graph: [],
        research_tasks: [],
        evidence_bundles: [],
        verification_verdicts: [],
        repair_tickets: [],
        memory_updates: [],
        determinations: [],
        trace_events: [],
        report_markdown: ""
      } as ResearchRun
    });

    render(<SdsReviewPanel />);

    expect(screen.getByText("SDS review")).toBeDefined();
    expect(screen.getByText("acme-sds.txt")).toBeDefined();
    expect(screen.getByText("Missing SDS sections")).toBeDefined();
    expect(screen.getByText("Incompatible storage terms found")).toBeDefined();
    expect(screen.getByText("flammable_liquid_storage_review")).toBeDefined();
    expect(screen.getByText("ephemeral")).toBeDefined();
  });
});
```

- [ ] Create `app/components/SdsReviewPanel.tsx`:

```tsx
"use client";

import { useStore } from "@/lib/ui/store";
import type { SdsFinding } from "@/lib/sds/types";
import { AlertTriangle, CheckCircle2, FileText, ShieldAlert } from "lucide-react";

const STATUS_CLASS = {
  complete: "text-teal-300 border-teal-800/50 bg-teal-950/30",
  incomplete: "text-amber-300 border-amber-800/50 bg-amber-950/30",
  stale: "text-amber-300 border-amber-800/50 bg-amber-950/30",
  unreadable: "text-red-300 border-red-800/50 bg-red-950/30",
  needs_expert_review: "text-red-300 border-red-800/50 bg-red-950/30"
} as const;

export function SdsReviewPanel() {
  const reviews = useStore((state) => state.run?.sds_reviews ?? []);
  if (reviews.length === 0) return null;

  return (
    <section className="border-t border-slate-800/60 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300/70">
        <ShieldAlert size={12} />
        SDS review
      </div>
      <div className="space-y-2">
        {reviews.map((review) => (
          <article key={review.document.id} className="border border-slate-800/70 bg-slate-950/40 p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                  <FileText size={13} />
                  <span className="truncate">{review.document.name}</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500">{review.document.source_type} · {review.document.retention}</div>
              </div>
              <span className={`shrink-0 border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[review.overall_status]}`}>
                {review.overall_status.replaceAll("_", " ")}
              </span>
            </div>
            <FindingList title="Quality" findings={review.quality_findings} />
            <FindingList title="Safety" findings={review.safety_findings} />
            {review.permit_handoff_facts.length > 0 && (
              <div className="mt-2 border-t border-slate-800/70 pt-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Permit handoff</div>
                <div className="space-y-1">
                  {review.permit_handoff_facts.map((fact) => (
                    <div key={`${fact.field}-${fact.source_section}-${fact.quote}`} className="text-[11px] text-slate-300">
                      <span className="font-mono text-cyan-300">{fact.field}</span>
                      <span className="text-slate-500"> · section {fact.source_section}</span>
                      <div className="mt-0.5 text-slate-500">{fact.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function FindingList({ title, findings }: { title: string; findings: SdsFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="space-y-1">
        {findings.slice(0, 4).map((finding) => (
          <div key={finding.id} className="flex gap-1.5 text-[11px] text-slate-300">
            {finding.severity === "info" ? (
              <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-teal-400" />
            ) : (
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-400" />
            )}
            <div>
              <div className="font-medium">{finding.title}</div>
              {finding.quote && <div className="text-slate-500">"{finding.quote}"</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] Modify `app/components/SidePanel.tsx`:

Add import:

```tsx
import { SdsReviewPanel } from "./SdsReviewPanel";
```

Render it between `CoverageFamilyList` and `RepairTicketsCard`:

```tsx
      <SdsReviewPanel />
```

- [ ] Run:

```bash
pnpm test -- app/components/__tests__/SdsReviewPanel.test.tsx
```

Expected result: SDS review artifact renders separately from the permit matrix.

## Task 8: Final Verification And Product Checks

- [ ] Run focused tests:

```bash
pnpm test -- src/lib/sds/__tests__/reviewer.test.ts src/lib/sds/__tests__/clientExtraction.test.ts src/lib/research/__tests__/toolCatalog.test.ts src/lib/research/__tests__/harnessRuntime.test.ts src/lib/research/__tests__/sdsRun.test.ts app/components/__tests__/SdsDocumentPicker.test.tsx app/components/__tests__/SdsReviewPanel.test.tsx
```

- [ ] Run full checks:

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
pnpm build
```

```bash
pnpm eval
```

- [ ] Manual UI check:

```bash
pnpm run dev
```

Open the local app, skip to manual entry, paste an SDS into the SDS review area, run a project, and verify:

- An SDS review card appears as a separate artifact.
- Missing or stale SDS issues remain visible.
- Permit handoff facts include quotes and section numbers.
- Permit matrix rows still cite regulatory sources, not SDS text.
- Uploaded SDS retention defaults to `ephemeral`.

- [ ] Final git check:

```bash
git status --short
```

Expected result: only SDS implementation files and intentional package lock changes are modified. Any unrelated UI edits remain preserved.
