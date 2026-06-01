import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROGRAM_REGISTRY } from "../programRegistry";
import { SKILL_FOR_HYPOTHESIS } from "../skillForHypothesis";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(HERE, "..", "skills");

describe("registry <-> skills parity", () => {
  it("every registry hypothesis has a skill whose SKILL.md exists on disk", () => {
    for (const program of PROGRAM_REGISTRY) {
      for (const hid of program.hypothesis_ids) {
        const skillId = SKILL_FOR_HYPOTHESIS[hid];
        expect(skillId, `hypothesis ${hid} (program ${program.id}) has no skill mapping`).toBeTruthy();
        expect(
          existsSync(join(SKILLS_DIR, skillId, "SKILL.md")),
          `skill dir ${skillId} missing for ${hid}`,
        ).toBe(true);
      }
    }
  });
});
