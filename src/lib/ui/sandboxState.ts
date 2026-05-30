import type { CoverageFamily, ResearchRun } from "@/lib/research/types";

export type SandboxStatus =
  | "queued"
  | "booting"
  | "fetching"
  | "verifying"
  | "verified"
  | "failed"
  | "repairing"
  | "repaired"
  | "needs_review"
  | "out_of_scope";

export type SandboxTile = {
  id: string;
  family: CoverageFamily;
  label: string;
  status: SandboxStatus;
  active: boolean;
};

function fired(
  run: ResearchRun,
  ids: Set<string>,
  actor: string,
  phase: string,
  status: string,
): boolean {
  return run.trace_events.some(
    (e) => e.actor === actor && e.phase === phase && e.status === status && ids.has(e.id),
  );
}

export function deriveSandboxTiles(run: ResearchRun, replayedEventIds: Set<string>): SandboxTile[] {
  const ids = replayedEventIds;
  const fanoutRunning = fired(run, ids, "research_pool", "fanout", "running");
  const fanoutDone = fired(run, ids, "research_pool", "fanout", "done");
  const failFired = fired(run, ids, "verifier", "verification", "failed");
  const repairResolved =
    fired(run, ids, "verifier", "repair_verification", "done") ||
    fired(run, ids, "verifier", "repair_verification", "needs_review") ||
    fired(run, ids, "synthesis_agent", "matrix", "done");

  const hypById = new Map(run.research_graph.map((h) => [h.id, h]));
  const verdictByHyp = new Map(run.verification_verdicts.map((v) => [v.hypothesis_id, v]));
  const repairHyp = new Set(run.repair_tickets.map((r) => r.hypothesis_id));
  const familiesWithTask = new Set<CoverageFamily>();

  const activeTiles: SandboxTile[] = run.research_tasks.map((task) => {
    const hyp = hypById.get(task.hypothesis_id);
    const family = (hyp?.family ?? "air") as CoverageFamily;
    familiesWithTask.add(family);

    const hasRepair = repairHyp.has(task.hypothesis_id);
    const verdict = verdictByHyp.get(task.hypothesis_id);
    const terminal: SandboxStatus =
      verdict?.verdict === "pass"
        ? hasRepair
          ? "repaired"
          : "verified"
        : verdict?.verdict === "needs_review"
          ? "needs_review"
          : verdict?.verdict === "fail"
            ? "failed"
            : "needs_review";

    let status: SandboxStatus;
    if (!fanoutRunning) status = "queued";
    else if (!fanoutDone) status = "fetching";
    else if (!repairResolved) status = hasRepair && failFired ? "repairing" : "verifying";
    else status = terminal;

    return { id: task.task_id, family, label: hyp?.question ?? family, status, active: true };
  });

  const mutedTiles: SandboxTile[] = run.coverage_family_statuses
    .filter((cf) => !familiesWithTask.has(cf.family))
    .map((cf) => ({
      id: cf.id,
      family: cf.family,
      label: cf.reason,
      status: (cf.status === "out_of_scope" ? "out_of_scope" : "needs_review") as SandboxStatus,
      active: false,
    }));

  return [...activeTiles, ...mutedTiles];
}
