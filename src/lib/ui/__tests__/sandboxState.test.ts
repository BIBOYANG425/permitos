import { describe, expect, it } from "vitest";
import { runResearch } from "@/lib/research/run";
import { deriveSandboxTiles } from "@/lib/ui/sandboxState";
import type { ResearchRun } from "@/lib/research/types";

const SOCAL =
  "A Los Angeles County manufacturer is adding a coating booth and storing 60 gallons of a new flammable solvent.";

function eventIds(run: ResearchRun, predicate: (e: ResearchRun["trace_events"][number]) => boolean) {
  return new Set(run.trace_events.filter(predicate).map((e) => e.id));
}

describe("deriveSandboxTiles", () => {
  it("starts every active worker tile as queued before replay", async () => {
    const run = await runResearch({ project_description: SOCAL, demo_documents: [] });
    const tiles = deriveSandboxTiles(run, new Set());
    const active = tiles.filter((t) => t.active);
    expect(active.length).toBe(run.research_tasks.length);
    expect(active.every((t) => t.status === "queued")).toBe(true);
  });

  it("shows workers fetching once fanout is running but not done", async () => {
    const run = await runResearch({ project_description: SOCAL, demo_documents: [] });
    const ids = eventIds(run, (e) => e.actor === "research_pool" && e.phase === "fanout" && e.status === "running");
    const tiles = deriveSandboxTiles(run, ids);
    expect(tiles.some((t) => t.active && t.status === "fetching")).toBe(true);
  });

  it("resolves every active tile to a terminal status when fully replayed", async () => {
    const run = await runResearch({ project_description: SOCAL, demo_documents: [] });
    const all = new Set(run.trace_events.map((e) => e.id));
    const tiles = deriveSandboxTiles(run, all);
    const terminal = ["verified", "repaired", "needs_review", "failed"];
    expect(tiles.filter((t) => t.active).every((t) => terminal.includes(t.status))).toBe(true);
  });

  it("marks a repaired hypothesis tile as repaired when fully replayed", async () => {
    const run = await runResearch({ project_description: SOCAL, demo_documents: [] });
    const all = new Set(run.trace_events.map((e) => e.id));
    const tiles = deriveSandboxTiles(run, all);
    const repairedHyp = new Set(run.repair_tickets.map((r) => r.hypothesis_id));
    // every task whose hypothesis had a repair ticket and ultimately passed reads as "repaired"
    for (const task of run.research_tasks) {
      if (!repairedHyp.has(task.hypothesis_id)) continue;
      const verdict = run.verification_verdicts.find((v) => v.hypothesis_id === task.hypothesis_id);
      if (verdict?.verdict !== "pass") continue;
      const tile = tiles.find((t) => t.id === task.task_id);
      expect(tile?.status).toBe("repaired");
    }
  });

  it("includes muted tiles for coverage families with no worker", async () => {
    const run = await runResearch({ project_description: SOCAL, demo_documents: [] });
    const tiles = deriveSandboxTiles(run, new Set());
    const muted = tiles.filter((t) => !t.active);
    // every muted tile maps to a coverage family that has no research task
    const familiesWithTask = new Set(
      run.research_tasks.map((task) => run.research_graph.find((h) => h.id === task.hypothesis_id)?.family),
    );
    expect(muted.every((t) => !familiesWithTask.has(t.family))).toBe(true);
  });
});
