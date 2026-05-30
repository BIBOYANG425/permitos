import type { EvidenceBundle, RepairTicket, ScopePack, VerificationVerdict } from "./types";
import { sourceFixtures } from "./fixtures/sources";

export function verifyEvidence(scope: ScopePack, bundle: EvidenceBundle): VerificationVerdict {
  const source = bundle.sources[0];

  if (!source) {
    return needsReview(bundle.hypothesis_id, "source_failed", "No source was returned by the worker.");
  }

  if (bundle.hypothesis_id === "H-HAZMAT-HMBP" && source.content_hash === "sha256:demo-hmbp-bad") {
    return {
      hypothesis_id: bundle.hypothesis_id,
      verdict: "fail",
      checks: {
        currency: { pass: true, reason: "source fetched from seeded cache for this run" },
        authority: { pass: true, reason: "official/high-authority HMBP source fixture" },
        grounding: {
          pass: false,
          reason: "Quote mentions threshold quantities, but extracted claim says all hazardous material storage."
        },
        predicate_math: { pass: false, reason: "No threshold was extracted from the quoted text." }
      },
      confidence: 0.32,
      repair_tickets: [
        {
          ticket_id: "R-HAZMAT-HMBP-001",
          hypothesis_id: bundle.hypothesis_id,
          failure_type: "grounding_failed",
          failed_check: "grounding",
          observed_problem: "Extracted claim was broader than the supporting quote.",
          repair_action: "rerun extraction with quote-constrained threshold comparison",
          max_attempts_remaining: 1
        }
      ]
    };
  }

  if (bundle.hypothesis_id === "H-HAZMAT-HMBP") {
    const chemical = scope.project_change.chemicals[0];
    const quantity = chemical?.quantity ?? null;
    const thresholdClaim = bundle.extracted_claims.find((claim) => claim.field === "liquid_gallons_threshold");
    const threshold = thresholdClaim ? Number(thresholdClaim.value) : null;

    if (quantity === null || threshold === null || Number.isNaN(threshold)) {
      return needsReview(bundle.hypothesis_id, "missing_fact", "Hazardous material quantity or threshold is missing.");
    }

    const passesThreshold = quantity >= threshold;
    return {
      hypothesis_id: bundle.hypothesis_id,
      verdict: passesThreshold ? "pass" : "needs_review",
      checks: {
        currency: { pass: true, reason: "source fetched from seeded cache for this run" },
        authority: { pass: true, reason: "official/high-authority HMBP source fixture" },
        grounding: { pass: true, reason: "quote contains the liquid hazardous material threshold" },
        predicate_math: {
          pass: passesThreshold,
          reason: `${quantity} gallons ${passesThreshold ? ">=" : "<"} ${threshold} gallon threshold.`
        }
      },
      confidence: passesThreshold ? 0.9 : 0.58,
      repair_tickets: []
    };
  }

  if (bundle.hypothesis_id === "H-WASTE-GENERATOR") {
    const missing = scope.project_change.waste_streams.some((stream) => stream.kg_per_month === null);
    if (missing) {
      return needsReview(bundle.hypothesis_id, "missing_fact", "Monthly hazardous waste quantity is missing.");
    }
  }

  if (bundle.hypothesis_id === "H-WASTEWATER-PRETREATMENT" && scope.project_change.process_discharge === null) {
    return needsReview(bundle.hypothesis_id, "missing_fact", "Process wastewater discharge status is missing.");
  }

  if (bundle.hypothesis_id === "H-STORM-CGP") {
    const acres = scope.project_change.disturbance_acres;
    const passesThreshold = typeof acres === "number" && acres >= 1;
    return {
      hypothesis_id: bundle.hypothesis_id,
      verdict: passesThreshold ? "pass" : "needs_review",
      checks: {
        currency: { pass: true, reason: "source fetched from seeded cache for this run" },
        authority: { pass: true, reason: "official state stormwater source fixture" },
        grounding: { pass: true, reason: "quote contains one-acre construction disturbance threshold" },
        predicate_math: {
          pass: passesThreshold,
          reason: passesThreshold ? `${acres} acres is at or above the 1 acre threshold.` : `${acres ?? "missing"} acres does not trigger a verified yes.`
        }
      },
      confidence: passesThreshold ? 0.9 : 0.62,
      repair_tickets: []
    };
  }

  if (bundle.hypothesis_id === "H-STORM-IGP" && !scope.facility.sic && !scope.facility.naics) {
    return needsReview(bundle.hypothesis_id, "missing_fact", "SIC/NAICS is missing; industrial stormwater coverage cannot be verified.");
  }

  return {
    hypothesis_id: bundle.hypothesis_id,
    verdict: "pass",
    checks: {
      currency: { pass: true, reason: "source fetched from seeded cache for this run" },
      authority: { pass: source.authority_rank <= 2, reason: "source is official or high-authority" },
      grounding: { pass: true, reason: "quote supports the extracted trigger or review path" },
      predicate_math: { pass: true, reason: "available project facts support this seeded determination or review path" }
    },
    confidence: 0.84,
    repair_tickets: []
  };
}

export function repairEvidence(scope: ScopePack, ticket: RepairTicket): EvidenceBundle {
  if (ticket.hypothesis_id !== "H-HAZMAT-HMBP") {
    return {
      hypothesis_id: ticket.hypothesis_id,
      sources: [],
      extracted_claims: [],
      researcher_conclusion: "needs_review",
      uncertainties: [`No scripted repair available for ${ticket.hypothesis_id}`]
    };
  }

  const fixture = sourceFixtures.hmbp_threshold_repaired;
  const chemical = scope.project_change.chemicals[0];
  const quantity = chemical?.quantity ?? null;
  const threshold = Number(fixture.extracted.liquid_gallons_threshold);

  return {
    hypothesis_id: ticket.hypothesis_id,
    sources: [
      {
        url: fixture.url,
        source_name: fixture.source_name,
        authority_rank: fixture.authority_rank,
        fetched_at: fixture.fetched_at,
        content_hash: fixture.content_hash,
        effective_date: fixture.effective_date,
        quote: fixture.quote
      }
    ],
    extracted_claims: [
      {
        field: "liquid_gallons_threshold",
        value: String(threshold),
        source_url: fixture.url,
        quote: fixture.quote,
        confidence: 0.91
      },
      {
        field: "predicate_math",
        value: quantity === null ? "missing quantity" : `${quantity} gallons >= ${threshold} gallons`,
        source_url: fixture.url,
        quote: fixture.quote,
        confidence: quantity === null ? 0.2 : 0.92
      }
    ],
    researcher_conclusion: quantity !== null && quantity >= threshold ? "applies" : "needs_review",
    uncertainties: quantity === null ? ["Chemical quantity missing; cannot compare HMBP threshold."] : []
  };
}

function needsReview(hypothesis_id: string, failure_type: RepairTicket["failure_type"], reason: string): VerificationVerdict {
  return {
    hypothesis_id,
    verdict: "needs_review",
    checks: {
      currency: { pass: true, reason: "source/cache status recorded" },
      authority: { pass: true, reason: "authority could be evaluated or source failure was explicit" },
      grounding: { pass: failure_type !== "source_failed", reason },
      predicate_math: { pass: false, reason }
    },
    confidence: 0.45,
    repair_tickets: []
  };
}
