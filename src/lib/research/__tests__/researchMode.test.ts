import { afterEach, describe, it, expect } from "vitest";
import { getResearchMode } from "../researchMode";

const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;

describe("getResearchMode resolution", () => {
  afterEach(() => {
    delete process.env.USE_MODAL;
    if (ORIGINAL_OPENAI_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
    process.env.RESEARCH_MODE = "fixture"; // restore suite default
  });

  it("honors an explicit RESEARCH_MODE", () => {
    for (const mode of ["live", "modal", "fixture"] as const) {
      process.env.RESEARCH_MODE = mode;
      expect(getResearchMode()).toBe(mode);
    }
  });

  it("maps the legacy USE_MODAL=1 switch to modal", () => {
    delete process.env.RESEARCH_MODE;
    process.env.USE_MODAL = "1";
    expect(getResearchMode()).toBe("modal");
  });

  it("defaults to live when an OpenAI key is present", () => {
    delete process.env.RESEARCH_MODE;
    delete process.env.USE_MODAL;
    process.env.OPENAI_API_KEY = "sk-test";
    expect(getResearchMode()).toBe("live");
  });

  it("fails closed to fixture when nothing is configured", () => {
    delete process.env.RESEARCH_MODE;
    delete process.env.USE_MODAL;
    delete process.env.OPENAI_API_KEY;
    expect(getResearchMode()).toBe("fixture");
  });
});
