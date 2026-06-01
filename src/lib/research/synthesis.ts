import type {
  Determination,
  EvidenceBundle,
  MemoryUpdate,
  RegulatoryAngle,
  ResearchHypothesis,
  ScopePack,
  VerificationVerdict
} from "./types";
import type { SdsHandoffRef, SdsReview } from "@/lib/sds/types";

export function synthesize(
  scope: ScopePack,
  hypotheses: ResearchHypothesis[],
  angles: RegulatoryAngle[],
  evidenceBundles: EvidenceBundle[],
  verdicts: VerificationVerdict[],
  sdsReviews: SdsReview[] = []
) {
  const evidenceByHypothesis = new Map(evidenceBundles.map((bundle) => [bundle.hypothesis_id, bundle]));
  const verdictByHypothesis = new Map(verdicts.map((verdict) => [verdict.hypothesis_id, verdict]));
  const angleById = new Map(angles.map((angle) => [angle.id, angle]));
  const sdsHandoffFacts = sdsReviews.flatMap((review) =>
    review.permit_handoff_facts
      .filter((fact) => fact.review_flag && fact.value === true)
      .map((fact) => ({
        ...fact,
        document_id: review.document.id,
        document_name: review.document.name
      }))
  );

  const determinations = hypotheses.map((hypothesis) => {
    const evidence = evidenceByHypothesis.get(hypothesis.id);
    const verdict = verdictByHypothesis.get(hypothesis.id);
    const angle = angleById.get(hypothesis.angle_id);
    const determination = determinationFor(scope, hypothesis, angle?.label ?? hypothesis.family, evidence, verdict);
    const sds_handoff_refs = matchingSdsHandoffFacts(hypothesis, sdsHandoffFacts);

    return {
      ...determination,
      ...(sds_handoff_refs.length > 0 ? { sds_handoff_refs } : {})
    };
  });

  const memory_updates = determinations
    .filter((determination) => determination.verified)
    .map<MemoryUpdate>((determination) => ({
      memory_type: "verified_source_fact",
      fact: `${determination.requirement}: ${determination.applies}`,
      source_url: determination.source_url,
      content_hash: evidenceByRequirement(evidenceBundles, determination.requirement),
      quote: determination.quote,
      verifier_verdict: "pass",
      as_of_date: "2026-05-30",
      expires_or_recheck_after: "2026-11-30"
    }));

  const report_markdown = renderReport(scope, determinations);

  return { determinations, memory_updates, report_markdown };
}

// Attach SDS handoff facts to the determination whose hypothesis they support.
// A fact only annotates a determination; it is never citable evidence and never
// flips verification (the boundary between SDS refs and regulatory proof).
function matchingSdsHandoffFacts(hypothesis: ResearchHypothesis, facts: SdsHandoffRef[]) {
  if (facts.length === 0) {
    return [];
  }
  const fieldMatches = fieldsForHypothesis(hypothesis.id);
  return facts.filter((fact) => fieldMatches.has(fact.field));
}

function fieldsForHypothesis(hypothesisId: string) {
  const map: Record<string, string[]> = {
    "H-AIR-VOC": ["voc_air_emissions_review"],
    "H-HAZMAT-HMBP": ["hazardous_material_inventory_review", "flammable_liquid_storage_review"],
    "H-WASTE-GENERATOR": ["hazardous_waste_review"]
  };
  return new Set(map[hypothesisId] ?? []);
}

function determinationFor(
  scope: ScopePack,
  hypothesis: ResearchHypothesis,
  angleLabel: string,
  evidence: EvidenceBundle | undefined,
  verdict: VerificationVerdict | undefined
): Determination {
  const source = evidence?.sources[0];
  const verified = verdict?.verdict === "pass";
  const applies = verified ? appliesFor(scope, hypothesis, evidence) : "needs_review";

  return {
    requirement: requirementFor(hypothesis.id),
    applies,
    trigger: hypothesis.question,
    project_fact: projectFactFor(scope, hypothesis.id, angleLabel),
    citation: source ? `${source.source_name}, fetched ${source.fetched_at.slice(0, 10)}` : "No supporting source verified",
    quote: source?.quote ?? verdict?.checks.predicate_math?.reason ?? "No quote available",
    source_url: source?.url ?? "",
    confidence: verdict?.confidence ?? 0.2,
    verified,
    review_flag: !verified,
    permit_filing: verified ? evidence?.permit_filing : undefined
  } satisfies Determination;
}

function appliesFor(
  scope: ScopePack,
  hypothesis: ResearchHypothesis,
  evidence: EvidenceBundle | undefined
): Determination["applies"] {
  // CGP keeps its real scope-derived predicate (acre threshold).
  if (hypothesis.id === "H-STORM-CGP") {
    return (scope.project_change.disturbance_acres ?? 0) >= 1 ? "yes" : "no";
  }
  // Generic: honor the researcher's grounded conclusion instead of always "yes".
  switch (evidence?.researcher_conclusion) {
    case "applies":
      return "yes";
    case "does_not_apply":
      return "no";
    default:
      return "needs_review";
  }
}

function requirementFor(hypothesisId: string) {
  const map: Record<string, string> = {
    "H-AIR-201": "SCAQMD Permit to Construct/Operate review",
    "H-AIR-VOC": "VOC emissions review",
    "H-AIR-219": "SCAQMD Rule 219 exemption check",
    "H-AIR-222": "SCAQMD Rule 222 registration check",
    "H-STORM-IGP": "California Industrial General Permit applicability",
    "H-STORM-CGP": "Construction stormwater permit coverage",
    "H-HAZMAT-HMBP": "HMBP/CERS hazardous material reporting",
    "H-WASTE-GENERATOR": "Hazardous waste generator status",
    "H-WASTEWATER-PRETREATMENT": "Industrial wastewater pretreatment review"
  };
  return map[hypothesisId] ?? hypothesisId;
}

function projectFactFor(scope: ScopePack, hypothesisId: string, angleLabel: string) {
  if (hypothesisId === "H-HAZMAT-HMBP") {
    const chemical = scope.project_change.chemicals[0];
    return `${chemical?.quantity ?? "missing"} ${chemical?.unit ?? ""} ${chemical?.name ?? "hazardous material"}`.trim();
  }
  if (hypothesisId === "H-STORM-CGP") {
    return `${scope.project_change.disturbance_acres ?? "missing"} acres disturbed`;
  }
  if (hypothesisId === "H-STORM-IGP") {
    return `SIC ${scope.facility.sic ?? "missing"} / NAICS ${scope.facility.naics ?? "missing"}`;
  }
  return angleLabel;
}

function evidenceByRequirement(evidenceBundles: EvidenceBundle[], requirement: string) {
  const matching = evidenceBundles.find((bundle) => requirementFor(bundle.hypothesis_id) === requirement);
  return matching?.sources[0]?.content_hash ?? null;
}

function renderReport(scope: ScopePack, determinations: Determination[]) {
  const rows = determinations
    .map(
      (row) =>
        `| ${row.requirement} | ${row.applies} | ${row.verified ? "verified" : "needs review"} | ${Math.round(row.confidence * 100)}% |`
    )
    .join("\n");

  return `# PermitPilot Applicability Matrix

Facility: ${scope.facility.address}

Jurisdiction stack: ${scope.facility.jurisdiction_stack.join(", ")}

| Requirement | Applies | Status | Confidence |
|---|---:|---|---:|
${rows}

Human review remains required for unverified, missing-fact, or novel determinations.
`;
}
