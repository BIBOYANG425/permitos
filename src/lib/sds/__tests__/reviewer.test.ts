import { describe, expect, it } from "vitest";
import { createSdsDocument, reviewSdsDocument, reviewSdsInputs } from "../reviewer";
import { mapSdsSections } from "../sectionMap";

const REVIEW_AS_OF_DATE = new Date("2026-05-30T00:00:00Z");

const COMPLETE_SDS_TEXT = `
Section 1: Identification
Product identifier: Solvent Blend 42.
Manufacturer: Antler Coatings LLC.
Emergency phone: CHEMTREC 1-800-424-9300.
Revision date: January 3, 2025.

Section 2: Hazard(s) identification
Danger. Highly flammable liquid and vapor. Causes serious eye irritation.
Precautionary statements: Keep away from heat, sparks, open flames, and hot surfaces.
Wear protective gloves and eye protection. Pictograms: flame, exclamation mark.

Section 3: Composition/information on ingredients
Acetone CAS 67-64-1 40-60%.
Toluene CAS 108-88-3 10-20%.

Section 4: First-aid measures
Move exposed person to fresh air. Rinse eyes cautiously with water for several minutes.
Call a poison center or physician if symptoms persist.

Section 5: Fire-fighting measures
Use dry chemical, alcohol-resistant foam, or carbon dioxide. Vapors may travel to ignition sources.
Firefighters should wear self-contained breathing apparatus.

Section 6: Accidental release measures
Stop leak if safe to do so. Contain spill with inert absorbent.
Prevent entry into waterways and storm drains.

Section 7: Handling and storage
Store in a flammable liquid storage cabinet.
Keep containers tightly closed and away from oxidizers and acids.
Keep away from ignition sources.

Section 8: Exposure controls/personal protection
Use chemical splash goggles, nitrile gloves, and local exhaust ventilation.
Maintain airborne concentrations below occupational exposure limits.

Section 9: Physical and chemical properties
Flash point: -4 F. VOC content: 620 g/L. Vapor pressure: 180 mmHg at 20 C.

Section 10: Stability and reactivity
Stable under recommended storage conditions.
Incompatible materials include strong oxidizers and strong acids.

Section 11: Toxicological information
Inhalation may cause drowsiness or dizziness. Eye contact causes irritation.
Repeated exposure may affect the central nervous system.

Section 12: Ecological information
Toxic to aquatic life. Avoid release to the environment.

Section 13: Disposal considerations
Dispose of contents and containers as hazardous waste in accordance with federal, state, and local regulations.

Section 14: Transport information
UN1993, Flammable liquids, n.o.s., Class 3, Packing Group II.

Section 15: Regulatory information
California Proposition 65: This product contains toluene known to the State of California to cause birth defects.
California facilities should assess CUPA, Title 22, and DTSC hazardous material and waste obligations.

Section 16: Other information
Prepared by EHS. Revision date: January 3, 2025.
`;

function reviewText(text: string, runId = "run_review", asOfDate = REVIEW_AS_OF_DATE) {
  const document = createSdsDocument({ name: "Solvent Blend 42 SDS", type: "sds", text }, runId, 0);
  return reviewSdsDocument(document, { asOfDate });
}

function withoutSection(text: string, sectionNumber: number) {
  const nextSection = sectionNumber + 1;
  return text.replace(new RegExp(`\\nSection ${sectionNumber}:[\\s\\S]*?(?=\\nSection ${nextSection}:)`, "m"), "");
}

function withoutRevisionDates(text: string) {
  return text
    .replace("Revision date: January 3, 2025.", "")
    .replace("Prepared by EHS. Revision date: January 3, 2025.", "Prepared by EHS compliance team.");
}

function numericOnlyHeadings(text: string) {
  return text.replace(/^Section (\d+): (.+)$/gm, (_line, number, heading) => {
    return Number(number) % 2 === 0 ? `${number} ${heading}` : `${number}. ${heading}`;
  });
}

function splitSectionHeadings(text: string) {
  return text.replace(/^Section (\d+): (.+)$/gm, (_line, number, heading) => {
    return Number(number) % 2 === 0 ? `Sec. ${number}:\n${heading}` : `Section ${number}:\n${heading}`;
  });
}

function withoutSectionBody(text: string, sectionNumber: number) {
  const nextSection = sectionNumber + 1;
  return text.replace(
    new RegExp(`(Section ${sectionNumber}:[^\\n]*\\n)[\\s\\S]*?(?=\\nSection ${nextSection}:)`, "m"),
    "$1",
  );
}

function replaceWithSplitTitleOnly(text: string, sectionNumber: number, title: string) {
  const nextSection = sectionNumber + 1;
  return text.replace(
    new RegExp(`Section ${sectionNumber}:[^\\n]*\\n[\\s\\S]*?(?=\\nSection ${nextSection}:)`, "m"),
    `Section ${sectionNumber}:\n${title}\n`,
  );
}

function replaceSectionBlock(text: string, sectionNumber: number, replacement: string) {
  const nextSection = sectionNumber + 1;
  return text.replace(
    new RegExp(`Section ${sectionNumber}:[\\s\\S]*?(?=\\nSection ${nextSection}:)`, "m"),
    replacement,
  );
}

describe("reviewSdsDocument", () => {
  it("maps all 16 sections and emits quality, safety, and permit handoff artifacts", () => {
    const review = reviewText(COMPLETE_SDS_TEXT);

    expect(review.overall_status).toBe("complete");
    expect(review.section_map.sections).toHaveLength(16);
    expect(review.section_map.sections.map((section) => section.section_number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    expect(review.section_map.sections.every((section) => section.status === "present")).toBe(true);
    expect(review.quality_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "run_review_sds_1_quality_all_sections_found",
          severity: "info",
          category: "section_completeness",
          title: "All 16 SDS sections found",
        }),
      ]),
    );
    expect(review.safety_findings.map((finding) => finding.category)).toEqual(
      expect.arrayContaining([
        "hazard_identification",
        "composition",
        "handling_storage",
        "ppe_exposure",
        "fire_spill_disposal",
        "transport",
        "california_ehs_implication",
      ]),
    );
    expect(review.safety_findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        "run_review_sds_1_safety_hazard_identification",
        "run_review_sds_1_safety_composition",
        "run_review_sds_1_safety_handling_storage",
        "run_review_sds_1_safety_ppe_exposure",
        "run_review_sds_1_safety_fire_spill_disposal",
        "run_review_sds_1_safety_transport",
        "run_review_sds_1_safety_california_ehs_implication",
      ]),
    );
    expect(review.permit_handoff_facts.map((fact) => fact.field)).toEqual(
      expect.arrayContaining([
        "hazardous_material_inventory_review",
        "flammable_liquid_storage_review",
        "voc_air_emissions_review",
        "incompatible_storage_review",
        "hazardous_waste_review",
        "spill_stormwater_containment_review",
        "california_ehs_review",
      ]),
    );
    for (const fact of review.permit_handoff_facts) {
      expect(fact.value).toBe(true);
      expect(fact.review_flag).toBe(true);
      expect(fact.quote.length).toBeGreaterThan(0);
      expect(fact.reason.length).toBeGreaterThan(0);
      expect(fact.confidence).toBeGreaterThan(0);
      expect(fact.source_section).toBeGreaterThanOrEqual(1);
    }
  });

  it("marks missing section 8 as incomplete with a critical section completeness finding", () => {
    const missingSection8Text = withoutSection(COMPLETE_SDS_TEXT, 8);

    expect(missingSection8Text).not.toMatch(/^Section 8:/m);
    expect(missingSection8Text).toMatch(/^Section 9:/m);

    const review = reviewText(missingSection8Text);
    const section8 = review.section_map.sections.find((section) => section.section_number === 8);

    expect(review.overall_status).toBe("incomplete");
    expect(section8).toEqual(
      expect.objectContaining({
        section_number: 8,
        status: "missing",
        text: "",
      }),
    );
    expect(review.quality_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          category: "section_completeness",
          title: "Missing SDS sections",
        }),
      ]),
    );
  });

  it("marks stale revision dates with freshness findings", () => {
    const staleText = COMPLETE_SDS_TEXT.replaceAll("January 3, 2025", "January 3, 2020");
    const review = reviewText(staleText);

    expect(review.overall_status).toBe("stale");
    expect(review.quality_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          category: "freshness",
          title: "SDS revision date appears stale",
        }),
      ]),
    );
  });

  it("uses the provided as-of date for deterministic stale revision decisions", () => {
    const review = reviewText(COMPLETE_SDS_TEXT, "run_future", new Date("2029-01-04T00:00:00Z"));

    expect(review.overall_status).toBe("stale");
    expect(review.quality_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "run_future_sds_1_quality_revision_date_stale",
          category: "freshness",
        }),
      ]),
    );
  });

  it("warns when no revision, prepared, or issue date is found", () => {
    const review = reviewText(withoutRevisionDates(COMPLETE_SDS_TEXT), "run_no_revision");

    expect(review.overall_status).toBe("complete");
    expect(review.quality_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "run_no_revision_sds_1_quality_revision_date_missing",
          severity: "warning",
          category: "freshness",
          title: "Revision date not found",
        }),
      ]),
    );
  });

  it("marks empty extracted PDF text that needs pasted text as unreadable", () => {
    const document = createSdsDocument(
      {
        name: "Unreadable SDS.pdf",
        type: "sds",
        text: "",
        source_type: "pdf",
        text_extraction_status: "needs_pasted_text",
      },
      "run_pdf",
      0,
    );
    const review = reviewSdsDocument(document, { asOfDate: REVIEW_AS_OF_DATE });

    expect(review.overall_status).toBe("unreadable");
    expect(review.document.text_extraction_status).toBe("needs_pasted_text");
    expect(review.section_map.sections).toHaveLength(16);
    expect(review.section_map.sections.every((section) => section.status === "missing")).toBe(true);
    expect(review.quality_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          title: "SDS text could not be extracted",
        }),
      ]),
    );
    expect(review.safety_findings).toEqual([]);
    expect(review.permit_handoff_facts).toEqual([]);
  });

  it("defaults empty PDF extraction to needs pasted text and marks review unreadable", () => {
    const document = createSdsDocument(
      {
        name: "scan.pdf",
        type: "sds",
        text: "",
        source_type: "pdf",
      },
      "run_scan",
      0,
    );
    const review = reviewSdsDocument(document, { asOfDate: REVIEW_AS_OF_DATE });

    expect(document.text_extraction_status).toBe("needs_pasted_text");
    expect(review.overall_status).toBe("unreadable");
    expect(review.quality_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          title: "SDS text could not be extracted",
        }),
      ]),
    );
  });

  it("requires an explicit as-of date for document review", () => {
    const document = createSdsDocument(
      { name: "Solvent Blend 42 SDS", type: "sds", text: COMPLETE_SDS_TEXT },
      "run_no_date",
      0,
    );

    expect(() => reviewSdsDocument(document, undefined as never)).toThrow("asOfDate is required");
  });

  it("adds quoted safety findings for incompatible storage and California EHS implication terms", () => {
    const review = reviewText(COMPLETE_SDS_TEXT);
    const storageFinding = review.safety_findings.find(
      (finding) => finding.category === "handling_storage" && finding.source_section === 7,
    );
    const californiaFinding = review.safety_findings.find(
      (finding) => finding.category === "california_ehs_implication",
    );

    expect(storageFinding).toEqual(
      expect.objectContaining({
        quote: expect.stringContaining("away from oxidizers and acids"),
      }),
    );
    expect(californiaFinding).toEqual(
      expect.objectContaining({
        quote: expect.stringContaining("California Proposition 65"),
      }),
    );
  });

  it("marks duplicate section headings as ambiguous and requires expert review", () => {
    const duplicateSection8Text = COMPLETE_SDS_TEXT.replace(
      "Section 8: Exposure controls/personal protection",
      "Section 8: Exposure controls/personal protection\nDuplicate exposure control note.\n\nSection 8: Exposure controls/personal protection",
    );
    const review = reviewText(duplicateSection8Text, "run_ambiguous");
    const section8 = review.section_map.sections.find((section) => section.section_number === 8);

    expect(review.overall_status).toBe("needs_expert_review");
    expect(section8).toEqual(expect.objectContaining({ status: "ambiguous", confidence: 0.5 }));
    expect(review.quality_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "run_ambiguous_sds_1_quality_ambiguous_or_merged_sections",
          severity: "warning",
          category: "section_completeness",
          title: "Ambiguous or merged SDS sections",
        }),
      ]),
    );
  });

  it("does not emit evidence from bodyless duplicate ambiguous sections", () => {
    const duplicateTitleOnlyText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      13,
      "Section 13: Disposal considerations\nSection 13: Disposal considerations\n",
    );
    const review = reviewText(duplicateTitleOnlyText, "run_duplicate_title_only");
    const section13 = review.section_map.sections.find((section) => section.section_number === 13);

    expect(review.overall_status).toBe("needs_expert_review");
    expect(section13).toEqual(expect.objectContaining({ status: "ambiguous" }));
    expect(section13?.text).toContain("Section 13: Disposal considerations");
    expect(review.safety_findings.map((finding) => finding.source_section)).not.toContain(13);
    expect(review.permit_handoff_facts.map((fact) => fact.field)).not.toContain("hazardous_waste_review");
  });

  it("preserves out-of-order duplicate section body text without emitting ambiguous section evidence", () => {
    const outOfOrderDuplicateText = COMPLETE_SDS_TEXT.replace(
      "Section 13: Disposal considerations\nDispose of contents and containers as hazardous waste in accordance with federal, state, and local regulations.\n\nSection 14: Transport information\nUN1993, Flammable liquids, n.o.s., Class 3, Packing Group II.",
      "Section 13: Disposal considerations\nInitial disposal handling summary.\n\nSection 14: Transport information\nUN1993, Flammable liquids, n.o.s., Class 3, Packing Group II.\n\nSection 13: Disposal considerations\nLater duplicate body says dispose as hazardous waste.",
    );
    const review = reviewText(outOfOrderDuplicateText, "run_out_of_order_duplicate");
    const section13 = review.section_map.sections.find((section) => section.section_number === 13);

    expect(review.overall_status).toBe("needs_expert_review");
    expect(section13).toEqual(expect.objectContaining({ status: "ambiguous" }));
    expect(section13?.text).toContain("Initial disposal handling summary.");
    expect(section13?.text).toContain("Later duplicate body says dispose as hazardous waste.");
    expect(review.safety_findings.map((finding) => finding.source_section)).not.toContain(13);
    expect(review.permit_handoff_facts.map((fact) => fact.field)).not.toContain("hazardous_waste_review");
  });

  it("keeps expert review status when stale documents also have ambiguous sections", () => {
    const staleText = COMPLETE_SDS_TEXT.replaceAll("January 3, 2025", "January 3, 2020");
    const staleDuplicateText = staleText.replace(
      "Section 8: Exposure controls/personal protection",
      "Section 8: Exposure controls/personal protection\nDuplicate exposure control note.\n\nSection 8: Exposure controls/personal protection",
    );
    const review = reviewText(staleDuplicateText, "run_stale_ambiguous");

    expect(review.overall_status).toBe("needs_expert_review");
    expect(review.quality_findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        "run_stale_ambiguous_sds_1_quality_revision_date_stale",
        "run_stale_ambiguous_sds_1_quality_ambiguous_or_merged_sections",
      ]),
    );
  });

  it("does not emit permit handoff facts without a matching source quote", () => {
    const noVocText = COMPLETE_SDS_TEXT.replace(
      "Flash point: -4 F. VOC content: 620 g/L. Vapor pressure: 180 mmHg at 20 C.",
      "Boiling range: 56 C to 111 C. Appearance: clear liquid.",
    );
    const review = reviewText(noVocText, "run_no_voc");

    expect(review.permit_handoff_facts.map((fact) => fact.field)).not.toContain("voc_air_emissions_review");
  });

  it("preserves a body-looking first line after a bare split heading", () => {
    const bareHazardText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      2,
      "Section 2:\nDanger. Highly flammable liquid and vapor.\n",
    );
    const review = reviewText(bareHazardText, "run_bare_hazard_body");
    const section2 = review.section_map.sections.find((section) => section.section_number === 2);

    expect(section2).toEqual(
      expect.objectContaining({
        status: "present",
        text: "Danger. Highly flammable liquid and vapor.",
      }),
    );
    expect(review.safety_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "hazard_identification",
          quote: expect.stringContaining("Highly flammable liquid and vapor"),
        }),
      ]),
    );
    expect(review.permit_handoff_facts.map((fact) => fact.field)).toContain(
      "hazardous_material_inventory_review",
    );
  });

  it("preserves punctuationless SDS body evidence after bare split headings", () => {
    const bareHazardText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      2,
      "Section 2:\nHighly flammable liquid and vapor\n",
    );
    const bareDisposalText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      13,
      "Section 13:\nDispose of contents as hazardous waste\n",
    );
    const bareSpillText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      6,
      "Section 6:\nPrevent entry into storm drains\n",
    );
    const hazardReview = reviewText(bareHazardText, "run_bare_hazard_no_punctuation");
    const disposalReview = reviewText(bareDisposalText, "run_bare_disposal_no_punctuation");
    const spillReview = reviewText(bareSpillText, "run_bare_spill_no_punctuation");

    expect(hazardReview.section_map.sections.find((section) => section.section_number === 2)).toEqual(
      expect.objectContaining({ status: "present", text: "Highly flammable liquid and vapor" }),
    );
    expect(hazardReview.safety_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "hazard_identification",
          quote: "Highly flammable liquid and vapor",
        }),
      ]),
    );
    expect(hazardReview.permit_handoff_facts.map((fact) => fact.field)).toContain(
      "hazardous_material_inventory_review",
    );

    expect(disposalReview.section_map.sections.find((section) => section.section_number === 13)).toEqual(
      expect.objectContaining({ status: "present", text: "Dispose of contents as hazardous waste" }),
    );
    expect(disposalReview.safety_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "fire_spill_disposal",
          quote: "Dispose of contents as hazardous waste",
        }),
      ]),
    );
    expect(disposalReview.permit_handoff_facts.map((fact) => fact.field)).toContain("hazardous_waste_review");

    expect(spillReview.section_map.sections.find((section) => section.section_number === 6)).toEqual(
      expect.objectContaining({ status: "present", text: "Prevent entry into storm drains" }),
    );
    expect(spillReview.permit_handoff_facts.map((fact) => fact.field)).toContain(
      "spill_stormwater_containment_review",
    );
  });

  it("classifies punctuationless split heading lines as body evidence or title metadata", () => {
    const bareExposureText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      8,
      "Section 8:\nLocal exhaust ventilation required\n",
    );
    const bareStorageText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      7,
      "Section 7:\nStore in a flammable liquid cabinet\n",
    );
    const titleOnlyDisposalText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      13,
      "Section 13:\nHazardous waste disposal considerations\n",
    );
    const exposureReview = reviewText(bareExposureText, "run_bare_exposure_required");
    const storageReview = reviewText(bareStorageText, "run_bare_storage_action");
    const titleOnlyReview = reviewText(titleOnlyDisposalText, "run_title_hazardous_waste");

    expect(exposureReview.section_map.sections.find((section) => section.section_number === 8)).toEqual(
      expect.objectContaining({ status: "present", text: "Local exhaust ventilation required" }),
    );
    expect(exposureReview.safety_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "ppe_exposure",
          quote: "Local exhaust ventilation required",
        }),
      ]),
    );

    expect(storageReview.section_map.sections.find((section) => section.section_number === 7)).toEqual(
      expect.objectContaining({ status: "present", text: "Store in a flammable liquid cabinet" }),
    );
    expect(storageReview.permit_handoff_facts.map((fact) => fact.field)).toContain(
      "flammable_liquid_storage_review",
    );

    expect(titleOnlyReview.section_map.sections.find((section) => section.section_number === 13)).toEqual(
      expect.objectContaining({ status: "merged", text: "" }),
    );
    expect(titleOnlyReview.safety_findings.map((finding) => finding.source_section)).not.toContain(13);
    expect(titleOnlyReview.permit_handoff_facts.map((fact) => fact.field)).not.toContain(
      "hazardous_waste_review",
    );
  });

  it("strips punctuated title metadata while preserving punctuated body evidence", () => {
    const titleOnlyDisposalText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      13,
      "Section 13:\nHazardous waste disposal considerations.\n",
    );
    const titleOnlyCaliforniaText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      15,
      "Section 15:\nCalifornia regulatory compliance and state environmental disclosure requirements.\n",
    );
    const disposalBodyText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      13,
      "Section 13:\nDispose of contents as hazardous waste.\n",
    );
    const hazardBodyText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      2,
      "Section 2:\nDanger. Highly flammable liquid and vapor.\n",
    );
    const titleOnlyDisposalReview = reviewText(titleOnlyDisposalText, "run_punctuated_disposal_title");
    const titleOnlyCaliforniaReview = reviewText(titleOnlyCaliforniaText, "run_punctuated_california_title");
    const disposalBodyReview = reviewText(disposalBodyText, "run_punctuated_disposal_body");
    const hazardBodyReview = reviewText(hazardBodyText, "run_punctuated_hazard_body");

    expect(titleOnlyDisposalReview.section_map.sections.find((section) => section.section_number === 13)).toEqual(
      expect.objectContaining({ status: "merged", text: "" }),
    );
    expect(titleOnlyDisposalReview.safety_findings.map((finding) => finding.source_section)).not.toContain(13);
    expect(titleOnlyDisposalReview.permit_handoff_facts.map((fact) => fact.field)).not.toContain(
      "hazardous_waste_review",
    );

    expect(titleOnlyCaliforniaReview.section_map.sections.find((section) => section.section_number === 15)).toEqual(
      expect.objectContaining({ status: "merged", text: "" }),
    );
    expect(titleOnlyCaliforniaReview.safety_findings.map((finding) => finding.source_section)).not.toContain(15);
    expect(titleOnlyCaliforniaReview.permit_handoff_facts.map((fact) => fact.field)).not.toContain(
      "california_ehs_review",
    );

    expect(disposalBodyReview.section_map.sections.find((section) => section.section_number === 13)).toEqual(
      expect.objectContaining({ status: "present", text: "Dispose of contents as hazardous waste." }),
    );
    expect(disposalBodyReview.permit_handoff_facts.map((fact) => fact.field)).toContain("hazardous_waste_review");

    expect(hazardBodyReview.section_map.sections.find((section) => section.section_number === 2)).toEqual(
      expect.objectContaining({ status: "present", text: "Danger. Highly flammable liquid and vapor." }),
    );
    expect(hazardBodyReview.permit_handoff_facts.map((fact) => fact.field)).toContain(
      "hazardous_material_inventory_review",
    );
  });

  it("preserves short rule-term split body evidence for safety and handoff review", () => {
    const nitrileGlovesText = replaceSectionBlock(COMPLETE_SDS_TEXT, 8, "Section 8:\nNitrile gloves\n");
    const wearGlovesText = replaceSectionBlock(COMPLETE_SDS_TEXT, 8, "Section 8:\nWear nitrile gloves\n");
    const vocText = replaceSectionBlock(COMPLETE_SDS_TEXT, 9, "Section 9:\nVOC content 620 g/L\n");
    const storageText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      7,
      "Section 7:\nFlammable liquid storage cabinet\n",
    );
    const californiaText = replaceSectionBlock(
      COMPLETE_SDS_TEXT,
      15,
      "Section 15:\nCalifornia Proposition 65\n",
    );
    const transportText = replaceSectionBlock(COMPLETE_SDS_TEXT, 14, "Section 14:\nUN1993\n");
    const compositionText = replaceSectionBlock(COMPLETE_SDS_TEXT, 3, "Section 3:\nAcetone CAS 67-64-1\n");
    const nitrileReview = reviewText(nitrileGlovesText, "run_short_nitrile");
    const wearReview = reviewText(wearGlovesText, "run_short_wear_nitrile");
    const vocReview = reviewText(vocText, "run_short_voc");
    const storageReview = reviewText(storageText, "run_short_storage");
    const californiaReview = reviewText(californiaText, "run_short_california");
    const transportReview = reviewText(transportText, "run_short_transport");
    const compositionReview = reviewText(compositionText, "run_short_composition");

    expect(nitrileReview.section_map.sections.find((section) => section.section_number === 8)).toEqual(
      expect.objectContaining({ status: "present", text: "Nitrile gloves" }),
    );
    expect(nitrileReview.safety_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "ppe_exposure",
          quote: "Nitrile gloves",
        }),
      ]),
    );

    expect(wearReview.section_map.sections.find((section) => section.section_number === 8)).toEqual(
      expect.objectContaining({ status: "present", text: "Wear nitrile gloves" }),
    );
    expect(wearReview.safety_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "ppe_exposure",
          quote: "Wear nitrile gloves",
        }),
      ]),
    );

    expect(vocReview.section_map.sections.find((section) => section.section_number === 9)).toEqual(
      expect.objectContaining({ status: "present", text: "VOC content 620 g/L" }),
    );
    expect(vocReview.permit_handoff_facts.map((fact) => fact.field)).toContain("voc_air_emissions_review");

    expect(storageReview.section_map.sections.find((section) => section.section_number === 7)).toEqual(
      expect.objectContaining({ status: "present", text: "Flammable liquid storage cabinet" }),
    );
    expect(storageReview.permit_handoff_facts.map((fact) => fact.field)).toContain(
      "flammable_liquid_storage_review",
    );

    expect(californiaReview.section_map.sections.find((section) => section.section_number === 15)).toEqual(
      expect.objectContaining({ status: "present", text: "California Proposition 65" }),
    );
    expect(californiaReview.safety_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "california_ehs_implication",
          quote: "California Proposition 65",
        }),
      ]),
    );
    expect(californiaReview.permit_handoff_facts.map((fact) => fact.field)).toContain("california_ehs_review");

    expect(transportReview.section_map.sections.find((section) => section.section_number === 14)).toEqual(
      expect.objectContaining({ status: "present", text: "UN1993" }),
    );
    expect(transportReview.safety_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "transport",
          quote: "UN1993",
        }),
      ]),
    );

    expect(compositionReview.section_map.sections.find((section) => section.section_number === 3)).toEqual(
      expect.objectContaining({ status: "present", text: "Acetone CAS 67-64-1" }),
    );
    expect(compositionReview.safety_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "composition",
          quote: "Acetone CAS 67-64-1",
        }),
      ]),
    );
  });
});

describe("mapSdsSections", () => {
  it("maps numeric-only SDS headings with dots or whitespace", () => {
    const numericText = numericOnlyHeadings(COMPLETE_SDS_TEXT);

    expect(numericText).toMatch(/^1\. Identification/m);
    expect(numericText).toMatch(/^2 Hazard\(s\) identification/m);

    const sectionMap = mapSdsSections("numeric_doc", numericText);

    expect(sectionMap.sections).toHaveLength(16);
    expect(sectionMap.sections.every((section) => section.status === "present")).toBe(true);
    expect(sectionMap.sections.find((section) => section.section_number === 1)?.text).toContain(
      "Product identifier",
    );
    expect(sectionMap.sections.find((section) => section.section_number === 2)?.text).toContain("Danger");
  });

  it("does not treat decimal subsection lines as top-level SDS headings", () => {
    const subsectionText = COMPLETE_SDS_TEXT
      .replace(
        "Use chemical splash goggles, nitrile gloves, and local exhaust ventilation.",
        "8.1 Control parameters\nOccupational exposure limits are listed by ingredient.\n8.2 Exposure controls\nUse chemical splash goggles, nitrile gloves, and local exhaust ventilation.",
      )
      .replace(
        "Flash point: -4 F. VOC content: 620 g/L. Vapor pressure: 180 mmHg at 20 C.",
        "9.1 Physical state\nLiquid.\nFlash point: -4 F. VOC content: 620 g/L. Vapor pressure: 180 mmHg at 20 C.",
      )
      .replace(
        "Stable under recommended storage conditions.",
        "10.1 Reactivity\nStable under recommended storage conditions.",
      )
      .replace(
        "California Proposition 65: This product contains toluene known to the State of California to cause birth defects.",
        "15.1 Regulatory information\nCalifornia Proposition 65: This product contains toluene known to the State of California to cause birth defects.",
      );
    const sectionMap = mapSdsSections("subsection_doc", subsectionText);

    for (const sectionNumber of [8, 9, 10, 15]) {
      expect(sectionMap.sections.find((section) => section.section_number === sectionNumber)).toEqual(
        expect.objectContaining({ status: "present" }),
      );
    }
    expect(sectionMap.sections.find((section) => section.section_number === 8)?.text).toContain(
      "8.2 Exposure controls",
    );
    expect(sectionMap.sections.find((section) => section.section_number === 8)?.text).toContain(
      "Use chemical splash goggles",
    );
    expect(sectionMap.sections.find((section) => section.section_number === 10)?.text).toContain(
      "Stable under recommended storage conditions.",
    );
    expect(sectionMap.sections.find((section) => section.section_number === 15)?.text).toContain(
      "California Proposition 65",
    );
  });

  it.each([
    [
      "8 .2 Exposure controls",
      8,
      "Use chemical splash goggles, nitrile gloves, and local exhaust ventilation.",
      "8 .2 Exposure controls\nUse chemical splash goggles, nitrile gloves, and local exhaust ventilation.",
    ],
    [
      "Section 8 .2 Exposure controls",
      8,
      "Use chemical splash goggles, nitrile gloves, and local exhaust ventilation.",
      "Section 8 .2 Exposure controls\nUse chemical splash goggles, nitrile gloves, and local exhaust ventilation.",
    ],
    [
      "9 .1 Physical state",
      9,
      "Flash point: -4 F. VOC content: 620 g/L. Vapor pressure: 180 mmHg at 20 C.",
      "9 .1 Physical state\nFlash point: -4 F. VOC content: 620 g/L. Vapor pressure: 180 mmHg at 20 C.",
    ],
    [
      "Section 9 .1 Physical state",
      9,
      "Flash point: -4 F. VOC content: 620 g/L. Vapor pressure: 180 mmHg at 20 C.",
      "Section 9 .1 Physical state\nFlash point: -4 F. VOC content: 620 g/L. Vapor pressure: 180 mmHg at 20 C.",
    ],
    [
      "10 .1 Reactivity",
      10,
      "Stable under recommended storage conditions.",
      "10 .1 Reactivity\nStable under recommended storage conditions.",
    ],
    [
      "Section 10 .1 Reactivity",
      10,
      "Stable under recommended storage conditions.",
      "Section 10 .1 Reactivity\nStable under recommended storage conditions.",
    ],
    [
      "15 .1 Regulatory information",
      15,
      "California Proposition 65: This product contains toluene known to the State of California to cause birth defects.",
      "15 .1 Regulatory information\nCalifornia Proposition 65: This product contains toluene known to the State of California to cause birth defects.",
    ],
    [
      "Section 15 .1 Regulatory information",
      15,
      "California Proposition 65: This product contains toluene known to the State of California to cause birth defects.",
      "Section 15 .1 Regulatory information\nCalifornia Proposition 65: This product contains toluene known to the State of California to cause birth defects.",
    ],
  ])(
    "does not treat OCR-spaced decimal subsection %s as a top-level heading",
    (subsectionLine, sectionNumber, target, replacement) => {
      const subsectionText = COMPLETE_SDS_TEXT.replace(target, replacement);
      const sectionMap = mapSdsSections("spaced_decimal_doc", subsectionText);
      const section = sectionMap.sections.find((candidate) => candidate.section_number === sectionNumber);

      expect(section).toEqual(expect.objectContaining({ status: "present" }));
      expect(section?.text).toContain(subsectionLine);
      expect(section?.text).toContain(String(target));
    },
  );

  it("preserves later body text when duplicate same-number headings are ambiguous", () => {
    const duplicateSection8Text = COMPLETE_SDS_TEXT.replace(
      "Section 8: Exposure controls/personal protection\nUse chemical splash goggles, nitrile gloves, and local exhaust ventilation.",
      "Section 8: Exposure controls/personal protection\nInitial exposure control summary.\n\nSection 8: Exposure controls/personal protection\nLater duplicate body keeps local exhaust ventilation.",
    );
    const sectionMap = mapSdsSections("duplicate_doc", duplicateSection8Text);
    const section8 = sectionMap.sections.find((section) => section.section_number === 8);

    expect(section8).toEqual(expect.objectContaining({ status: "ambiguous" }));
    expect(section8?.text).toContain("Initial exposure control summary.");
    expect(section8?.text).toContain("Later duplicate body keeps local exhaust ventilation.");
  });

  it("maps bare section-prefixed headings split across OCR/PDF lines", () => {
    const splitHeadingText = splitSectionHeadings(COMPLETE_SDS_TEXT);

    expect(splitHeadingText).toMatch(/^Section 1:\nIdentification/m);
    expect(splitHeadingText).toMatch(/^Sec\. 2:\nHazard\(s\) identification/m);

    const sectionMap = mapSdsSections("split_doc", splitHeadingText);
    const section1 = sectionMap.sections.find((section) => section.section_number === 1);

    expect(sectionMap.sections).toHaveLength(16);
    expect(sectionMap.sections.every((section) => section.status === "present")).toBe(true);
    expect(section1).toEqual(
      expect.objectContaining({
        heading: "Identification",
        text: expect.stringContaining("Product identifier: Solvent Blend 42."),
      }),
    );
    expect(section1?.text).not.toContain("Identification\nProduct identifier");
    expect(section1?.text).not.toContain("Danger. Highly flammable liquid and vapor.");
  });

  it("does not treat split heading title lines as section body evidence", () => {
    const headingOnlyText = splitSectionHeadings(
      withoutSectionBody(withoutSectionBody(COMPLETE_SDS_TEXT, 10), 13),
    );
    const sectionMap = mapSdsSections("heading_only_doc", headingOnlyText);
    const section10 = sectionMap.sections.find((section) => section.section_number === 10);
    const section13 = sectionMap.sections.find((section) => section.section_number === 13);
    const review = reviewText(headingOnlyText, "run_heading_only");

    expect(section10).toEqual(expect.objectContaining({ text: "" }));
    expect(section13).toEqual(expect.objectContaining({ text: "" }));
    expect(review.safety_findings.find((finding) => finding.source_section === 13)).toBeUndefined();
    expect(review.permit_handoff_facts.map((fact) => fact.field)).not.toContain("incompatible_storage_review");
    expect(review.permit_handoff_facts.map((fact) => fact.field)).not.toContain("hazardous_waste_review");
  });

  it("does not emit evidence from shortened split title-only sections", () => {
    const titleOnlyText = replaceWithSplitTitleOnly(
      replaceWithSplitTitleOnly(
        replaceWithSplitTitleOnly(
          replaceWithSplitTitleOnly(COMPLETE_SDS_TEXT, 6, "Spill"),
          10,
          "Reactivity",
        ),
        13,
        "Disposal",
      ),
      15,
      "California regulatory information",
    );
    const sectionMap = mapSdsSections("short_title_doc", titleOnlyText);
    const review = reviewText(titleOnlyText, "run_short_titles");

    expect(sectionMap.sections.find((section) => section.section_number === 6)).toEqual(
      expect.objectContaining({ status: "merged", text: "" }),
    );
    expect(sectionMap.sections.find((section) => section.section_number === 10)).toEqual(
      expect.objectContaining({ text: "" }),
    );
    expect(sectionMap.sections.find((section) => section.section_number === 13)).toEqual(
      expect.objectContaining({ text: "" }),
    );
    expect(sectionMap.sections.find((section) => section.section_number === 15)).toEqual(
      expect.objectContaining({ text: "" }),
    );
    expect(review.safety_findings.map((finding) => finding.source_section)).not.toContain(13);
    expect(review.safety_findings.map((finding) => finding.source_section)).not.toContain(15);
    expect(review.permit_handoff_facts.map((fact) => fact.field)).not.toContain(
      "spill_stormwater_containment_review",
    );
    expect(review.permit_handoff_facts.map((fact) => fact.field)).not.toContain("incompatible_storage_review");
    expect(review.permit_handoff_facts.map((fact) => fact.field)).not.toContain("hazardous_waste_review");
    expect(review.permit_handoff_facts.map((fact) => fact.field)).not.toContain("california_ehs_review");
  });

  it("does not emit evidence from long split title-only sections", () => {
    const titleOnlyText = replaceWithSplitTitleOnly(
      replaceWithSplitTitleOnly(
        replaceWithSplitTitleOnly(COMPLETE_SDS_TEXT, 6, "Spill response and containment planning requirements"),
        13,
        "Waste disposal considerations and regulatory disposal requirements",
      ),
      15,
      "California regulatory compliance and state environmental disclosure requirements",
    );
    const sectionMap = mapSdsSections("long_title_doc", titleOnlyText);
    const review = reviewText(titleOnlyText, "run_long_titles");

    expect(sectionMap.sections.find((section) => section.section_number === 6)).toEqual(
      expect.objectContaining({ status: "merged", text: "" }),
    );
    expect(sectionMap.sections.find((section) => section.section_number === 13)).toEqual(
      expect.objectContaining({ status: "merged", text: "" }),
    );
    expect(sectionMap.sections.find((section) => section.section_number === 15)).toEqual(
      expect.objectContaining({ status: "merged", text: "" }),
    );
    expect(review.safety_findings.map((finding) => finding.source_section)).not.toContain(13);
    expect(review.safety_findings.map((finding) => finding.source_section)).not.toContain(15);
    expect(review.permit_handoff_facts.map((fact) => fact.field)).not.toContain(
      "spill_stormwater_containment_review",
    );
    expect(review.permit_handoff_facts.map((fact) => fact.field)).not.toContain("hazardous_waste_review");
    expect(review.permit_handoff_facts.map((fact) => fact.field)).not.toContain("california_ehs_review");
  });

  it("keeps real Section 6, 13, and 15 body text as handoff evidence", () => {
    const review = reviewText(COMPLETE_SDS_TEXT, "run_real_body_evidence");
    const splitReview = reviewText(splitSectionHeadings(COMPLETE_SDS_TEXT), "run_split_real_body_evidence");

    expect(review.permit_handoff_facts.map((fact) => fact.field)).toEqual(
      expect.arrayContaining([
        "spill_stormwater_containment_review",
        "hazardous_waste_review",
        "california_ehs_review",
      ]),
    );
    expect(splitReview.permit_handoff_facts.map((fact) => fact.field)).toEqual(
      expect.arrayContaining([
        "spill_stormwater_containment_review",
        "hazardous_waste_review",
        "california_ehs_review",
      ]),
    );
  });
});

describe("reviewSdsInputs", () => {
  it("reviews only SDS demo documents and defaults retention to ephemeral", () => {
    const reviews = reviewSdsInputs(
      [
        { name: "Solvent Blend 42 SDS", type: "sds", text: COMPLETE_SDS_TEXT },
        { name: "Process narrative", type: "project_document", text: "Not an SDS." },
        { name: "Missing text", type: "sds" },
        null,
      ],
      "run_inputs",
      { asOfDate: REVIEW_AS_OF_DATE },
    );

    expect(reviews).toHaveLength(1);
    expect(reviews[0].document.id).toBe("run_inputs_sds_1");
    expect(reviews[0].document.retention).toBe("ephemeral");
    expect(reviews[0].document.source_type).toBe("pasted_text");
  });

  it("requires an explicit as-of date for bulk review", () => {
    expect(() =>
      reviewSdsInputs(
        [{ name: "Solvent Blend 42 SDS", type: "sds", text: COMPLETE_SDS_TEXT }],
        "run_no_bulk_date",
        undefined as never,
      ),
    ).toThrow("asOfDate is required");
  });

  it("passes as-of date options through to each SDS document review", () => {
    const staleUnderLiveClockText = COMPLETE_SDS_TEXT.replaceAll("January 3, 2025", "January 3, 2020");
    const reviews = reviewSdsInputs(
      [{ name: "Older but current as of 2022", type: "sds", text: staleUnderLiveClockText }],
      "run_bulk_options",
      { asOfDate: new Date("2022-01-04T00:00:00Z") },
    );

    expect(reviews).toHaveLength(1);
    expect(reviews[0].overall_status).toBe("complete");
    expect(reviews[0].quality_findings.map((finding) => finding.id)).not.toContain(
      "run_bulk_options_sds_1_quality_revision_date_stale",
    );
  });
});
