import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildScope } from "../buildScope";

describe("buildScope", () => {
  const savedKey = process.env.OPENAI_API_KEY;
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY; // force the deterministic emptyScope path
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  });

  it("returns a ScopePack carrying the description + a fresh run_id and empty sds_reviews", async () => {
    const { scope, sds_reviews } = await buildScope({
      project_description: "Install a coating booth",
      demo_documents: [],
    });
    expect(scope.run_id).toMatch(/^run_/);
    expect(scope.project_change.description).toBe("Install a coating booth");
    expect(scope.facility.jurisdiction_stack.length).toBeGreaterThan(0);
    expect(sds_reviews).toEqual([]);
  });
});
