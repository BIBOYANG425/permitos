// Confidence is computed from the verifier's external, checkable signals — never
// asserted as a free-text model number. Two principles from the verification model:
//   1. CAP, don't average. A failed check ceilings confidence at that check's cap;
//      passing the other three cannot buy it back. (A stale-law or ungrounded claim
//      stays low no matter how clean the rest is.)
//   2. Self-consistency scales it. Instability across N re-runs lowers confidence;
//      full stability applies no penalty.
// Calibration (mapping these signals to a probability against labeled facilities,
// tracking ECE) is the next step; this is the structured, monotonic basis for it.

export type VerificationCheck = { pass: boolean; reason: string };
export type VerificationChecks = Record<string, VerificationCheck>;

export type ConsistencySignal = {
  samples: number; // N re-runs with varied phrasing
  stableSamples: number; // how many agreed with the majority permit-set
};

// Ceiling a failed check imposes. Ordered by how fatal the failure is to a
// defensible determination: stale law and ungrounded quotes are near-fatal;
// a below-threshold predicate is "needs review", not "wrong"; a single
// unconfirmed cross-source is the softest.
const FAIL_CAP: Record<string, number> = {
  currency: 0.3,
  grounding: 0.35,
  authority: 0.5,
  predicate_math: 0.55,
  cross_source: 0.7,
};

const DEFAULT_FAIL_CAP = 0.6;
const BASE_ALL_PASS = 0.9; // residual uncertainty even when every check passes
const PER_EXTRA_FAIL_PENALTY = 0.05;
const MIN_CONFIDENCE = 0.05;
const MAX_CONFIDENCE = 0.97;

export function computeConfidence(checks: VerificationChecks, consistency?: ConsistencySignal): number {
  const failed = Object.entries(checks).filter(([, check]) => !check.pass);

  let confidence = BASE_ALL_PASS;
  for (const [name] of failed) {
    confidence = Math.min(confidence, FAIL_CAP[name] ?? DEFAULT_FAIL_CAP);
  }
  if (failed.length > 1) {
    confidence -= PER_EXTRA_FAIL_PENALTY * (failed.length - 1);
  }

  if (consistency && consistency.samples > 0) {
    const stability = clamp(consistency.stableSamples / consistency.samples, 0, 1);
    confidence *= 0.6 + 0.4 * stability;
  }

  return round2(clamp(confidence, MIN_CONFIDENCE, MAX_CONFIDENCE));
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
