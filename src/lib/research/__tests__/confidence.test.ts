import { describe, expect, it } from "vitest";
import { computeConfidence } from "../confidence";

const pass = (reason = "ok") => ({ pass: true, reason });
const fail = (reason = "no") => ({ pass: false, reason });

describe("computeConfidence", () => {
  it("returns the all-pass base when every check passes", () => {
    expect(
      computeConfidence({ currency: pass(), authority: pass(), grounding: pass(), predicate_math: pass() }),
    ).toBe(0.9);
  });

  it("caps on a failed check rather than averaging", () => {
    // three passes + one grounding fail must NOT average high; it caps at grounding's ceiling
    expect(
      computeConfidence({ currency: pass(), authority: pass(), grounding: fail(), predicate_math: pass() }),
    ).toBe(0.35);
  });

  it("a stale-currency failure caps hardest (cannot assert current law)", () => {
    expect(computeConfidence({ currency: fail(), authority: pass(), grounding: pass(), predicate_math: pass() })).toBe(
      0.3,
    );
  });

  it("a below-threshold predicate failure lands in needs-review territory", () => {
    expect(
      computeConfidence({ currency: pass(), authority: pass(), grounding: pass(), predicate_math: fail() }),
    ).toBe(0.55);
  });

  it("multiple failures take the lowest cap minus a per-extra-failure penalty", () => {
    // grounding (0.35) + predicate_math (0.55) -> min 0.35, then -0.05 for the extra failure
    expect(
      computeConfidence({ currency: pass(), authority: pass(), grounding: fail(), predicate_math: fail() }),
    ).toBe(0.3);
  });

  it("never exceeds the calibrated ceiling and never drops below the floor", () => {
    expect(computeConfidence({ a: pass() })).toBeLessThanOrEqual(0.97);
    expect(
      computeConfidence({ a: fail(), b: fail(), c: fail(), d: fail(), e: fail() }),
    ).toBeGreaterThanOrEqual(0.05);
  });

  it("self-consistency instability scales confidence down", () => {
    const checks = { currency: pass(), authority: pass(), grounding: pass(), predicate_math: pass() };
    const stable = computeConfidence(checks, { samples: 5, stableSamples: 5 });
    const shaky = computeConfidence(checks, { samples: 5, stableSamples: 3 });
    const unstable = computeConfidence(checks, { samples: 5, stableSamples: 0 });
    expect(stable).toBe(0.9); // full stability = no penalty
    expect(shaky).toBeLessThan(stable);
    expect(unstable).toBeLessThan(shaky);
  });

  it("is monotonic: adding a failed check never raises confidence", () => {
    const base = computeConfidence({ currency: pass(), authority: pass(), grounding: pass(), predicate_math: pass() });
    const withFail = computeConfidence({
      currency: pass(),
      authority: pass(),
      grounding: pass(),
      predicate_math: fail(),
    });
    expect(withFail).toBeLessThanOrEqual(base);
  });
});
