import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { planResearch } from "../planner";
import { SKILL_FOR_HYPOTHESIS, skillForHypothesis } from "../skillForHypothesis";
import { isAllowlistedUrl } from "../sourceAllowlist";
import type { ScopePack } from "../types";

const SKILLS_DIR = path.join(__dirname, "..", "skills");

// A maximal scope that activates all five coverage families the planner knows
// (air, stormwater, hazmat, waste, wastewater) so planResearch() emits every
// hypothesis id reachable from hypothesesFor(). We key the parity assertions off
// THIS actual planner output, not the CoverageFamily type (which lists extra
// families the planner does not yet emit).
function maximalScope(): ScopePack {
  return {
    run_id: "parity-test",
    facility: {
      address: "1 Test Way, Los Angeles, CA",
      jurisdiction_stack: ["CA", "SCAQMD"],
      naics: "333912",
      sic: "3471",
    },
    project_change: {
      description: "Install a coating booth and process equipment with solvent use.",
      equipment: [
        { kind: "coating_booth", description: "Spray coating booth" },
        { kind: "process_equipment", description: "Process oven" },
      ],
      chemicals: [{ name: "Acetone", quantity: 200, unit: "gallons", hazard: "flammable" }],
      waste_streams: [{ description: "Spent solvent", kg_per_month: 1200 }],
      disturbance_acres: 2,
      process_discharge: true,
    },
    missing_facts: [],
    assumptions: [],
  };
}

// Frontmatter `id` for a skill dir, parsed with a simple regex (no new deps).
function readSkillFrontmatterId(skillId: string): string | null {
  const file = path.join(SKILLS_DIR, skillId, "SKILL.md");
  if (!fs.existsSync(file)) {
    return null;
  }
  const text = fs.readFileSync(file, "utf8");
  const fm = /^---\s*\n([\s\S]*?)\n---/m.exec(text);
  if (!fm) {
    return null;
  }
  const idLine = /^id:\s*(.+?)\s*$/m.exec(fm[1]);
  return idLine ? idLine[1].trim() : null;
}

// All `## Sources` list URLs across a skill file.
function readSkillSourceUrls(skillId: string): string[] {
  const file = path.join(SKILLS_DIR, skillId, "SKILL.md");
  const text = fs.readFileSync(file, "utf8");
  const section = /##\s*Sources\s*\n([\s\S]*?)(?:\n##\s|\s*$)/m.exec(text);
  if (!section) {
    return [];
  }
  const urls: string[] = [];
  const lineRe = /^\s*-\s*(\S+)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(section[1])) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function listSkillDirs(): string[] {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(SKILLS_DIR, name, "SKILL.md")));
}

// Skill dir name -> frontmatter id (must match). Built once for the suite.
const skillDirs = listSkillDirs();
const frontmatterIdByDir = new Map<string, string>();
for (const dir of skillDirs) {
  const id = readSkillFrontmatterId(dir);
  if (id) {
    frontmatterIdByDir.set(dir, id);
  }
}
const knownSkillIds = new Set<string>(frontmatterIdByDir.values());

// The planner's real output, keyed off coverageFamilies (not the CoverageFamily type).
const plan = planResearch(maximalScope());
const emittedFamilies = new Set(plan.research_graph.map((h) => h.family));
const emittedHypothesisIds = plan.research_graph.map((h) => h.id);

describe("EHS skills library parity", () => {
  it("frontmatter id matches the directory name for every skill", () => {
    for (const dir of skillDirs) {
      expect(frontmatterIdByDir.get(dir)).toBe(dir);
    }
  });

  it("(a) every family the planner emits has >= 1 skill mapped to it", () => {
    // Family -> skill id via the hypothesis map: pick any hypothesis of that family
    // and resolve its skill, then assert that skill file exists.
    expect(emittedFamilies.size).toBeGreaterThan(0);
    for (const family of emittedFamilies) {
      const hypothesisOfFamily = plan.research_graph.find((h) => h.family === family);
      expect(hypothesisOfFamily, `no hypothesis for family ${family}`).toBeDefined();
      const skillId = skillForHypothesis(hypothesisOfFamily!.id);
      expect(skillId, `family ${family} has no mapped skill`).not.toBeNull();
      expect(knownSkillIds.has(skillId!), `family ${family} -> ${skillId} has no SKILL.md`).toBe(true);
    }
  });

  it("(b) every hypothesis the planner can emit maps to an existing skill file", () => {
    expect(emittedHypothesisIds.length).toBeGreaterThan(0);
    for (const id of emittedHypothesisIds) {
      const skillId = SKILL_FOR_HYPOTHESIS[id];
      expect(skillId, `hypothesis ${id} missing from SKILL_FOR_HYPOTHESIS`).toBeDefined();
      const file = path.join(SKILLS_DIR, skillId, "SKILL.md");
      expect(fs.existsSync(file), `hypothesis ${id} -> ${skillId} SKILL.md missing`).toBe(true);
      expect(knownSkillIds.has(skillId), `${skillId} frontmatter id not found`).toBe(true);
    }
  });

  it("(c) every ## Sources URL in every skill passes isAllowlistedUrl", () => {
    let totalUrls = 0;
    for (const dir of skillDirs) {
      const urls = readSkillSourceUrls(dir);
      expect(urls.length, `skill ${dir} has no Sources URLs`).toBeGreaterThan(0);
      for (const url of urls) {
        totalUrls += 1;
        expect(isAllowlistedUrl(url), `${dir}: ${url} is not allowlisted`).toBe(true);
      }
    }
    expect(totalUrls).toBeGreaterThan(0);
  });

  it("SKILL_FOR_HYPOTHESIS targets are all real skill ids (no dangling map entries)", () => {
    for (const [hypothesisId, skillId] of Object.entries(SKILL_FOR_HYPOTHESIS)) {
      expect(knownSkillIds.has(skillId), `${hypothesisId} -> ${skillId} is not a real skill`).toBe(true);
    }
  });
});
