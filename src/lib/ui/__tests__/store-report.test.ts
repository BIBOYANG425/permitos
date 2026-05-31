import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../store";

describe("store reportFamily slice", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("starts with reportFamily as null", () => {
    expect(useStore.getState().reportFamily).toBeNull();
  });

  it("openReport sets reportFamily", () => {
    useStore.getState().openReport("air");
    expect(useStore.getState().reportFamily).toBe("air");
  });

  it("closeReport resets reportFamily to null", () => {
    useStore.getState().openReport("hazmat");
    expect(useStore.getState().reportFamily).toBe("hazmat");
    useStore.getState().closeReport();
    expect(useStore.getState().reportFamily).toBeNull();
  });

  it("openReport replaces previous family", () => {
    useStore.getState().openReport("air");
    useStore.getState().openReport("stormwater");
    expect(useStore.getState().reportFamily).toBe("stormwater");
  });

  it("reset clears reportFamily", () => {
    useStore.getState().openReport("waste");
    useStore.getState().reset();
    expect(useStore.getState().reportFamily).toBeNull();
  });
});
