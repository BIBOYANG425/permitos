import { describe, it, expect } from "vitest";
import { SCENARIOS } from "../scenarios";

describe("SCENARIOS", () => {
  it("has exactly 3 buttons", () => {
    expect(SCENARIOS).toHaveLength(3);
  });

  it("complex payload routes to complex scope (no missing/construction trigger words)", () => {
    const p = SCENARIOS.find((s) => s.id === "complex")!.payload.project_description.toLowerCase();
    expect(p.includes("1.2 acre")).toBe(false);
    expect(p.includes("construction")).toBe(false);
    expect(p.includes("missing")).toBe(false);
    expect(p.includes("unknown")).toBe(false);
    expect(p.includes("omit")).toBe(false);
  });

  it("simple payload contains '1.2 acre' to route to construction scope", () => {
    const p = SCENARIOS.find((s) => s.id === "simple")!.payload.project_description.toLowerCase();
    expect(p.includes("1.2 acre")).toBe(true);
  });

  it("missing payload contains 'unknown' to route to missing scope", () => {
    const p = SCENARIOS.find((s) => s.id === "missing")!.payload.project_description.toLowerCase();
    expect(p.includes("unknown") || p.includes("missing") || p.includes("omit")).toBe(true);
  });
});
