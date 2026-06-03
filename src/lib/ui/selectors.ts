import type {
  ResearchRun,
  VerificationVerdict,
  CoverageFamily,
  CoverageFamilyStatus,
  Determination,
  EvidenceBundle,
  RepairTicket,
} from "@/lib/research/types";

export type VerificationCounts = {
  verified: number;
  needs_review: number;
  failed_open: number;
  repairs_ran: number;
  blocked: number;
};

export function getVerificationCounts(run: ResearchRun): VerificationCounts {
  const verified = run.determinations.filter((d) => d.verified).length;
  const needs_review = run.determinations.filter((d) => d.review_flag).length;

  const lastByHyp = new Map<string, VerificationVerdict>();
  for (const v of run.verification_verdicts) lastByHyp.set(v.hypothesis_id, v);
  const failed_open = [...lastByHyp.values()].filter((v) => v.verdict === "fail").length;

  const repairs_ran = run.repair_tickets.length;
  const blocked = run.coverage_family_statuses.filter((c) => c.status === "blocked_missing_fact").length;

  return { verified, needs_review, failed_open, repairs_ran, blocked };
}

export type RepairAttempt = {
  attempt: number;
  verdict: "pass" | "fail" | "needs_review";
  failed_check?: string;
  failure_reason?: string;
  repair_action?: string;
  quote?: string;
};

export function getRepairHistory(run: ResearchRun, hypothesisId: string): RepairAttempt[] {
  const verdicts = run.verification_verdicts.filter((v) => v.hypothesis_id === hypothesisId);
  if (verdicts.length === 0) return [];
  const tickets = run.repair_tickets.filter((t) => t.hypothesis_id === hypothesisId);
  const bundles = run.evidence_bundles.filter((b) => b.hypothesis_id === hypothesisId);

  return verdicts.map((v, i) => {
    const failedCheck = Object.entries(v.checks).find(([, c]) => !c.pass);
    const ticket = tickets[i];
    const bundle = bundles[i] ?? bundles[bundles.length - 1];
    return {
      attempt: i + 1,
      verdict: v.verdict,
      failed_check: failedCheck?.[0],
      failure_reason: failedCheck?.[1]?.reason,
      repair_action: ticket?.repair_action,
      quote: bundle?.sources[0]?.quote,
    };
  });
}

/**
 * Resolve a determination row back to its hypothesis id by index alignment.
 *
 * Contract: the orchestrate endpoint's finalize step
 * (research_core.finalize_run) emits `determinations` PREFIX-aligned with
 * `research_graph` — the first `research_graph.length` determinations
 * correspond by index (`run.determinations[i]` ↔ `run.research_graph[i]`).
 * Recall-floor rows are appended AFTER that prefix and have no hypothesis,
 * so this returns null for those indices; the arrays are not required to be
 * equal length. This is the actual data contract, not a fuzzy text match.
 *
 * Credit: pattern absorbed from BIBOYANG425's PR #1
 * (src/lib/researchSelectors.ts#hypothesisIdForDeterminationIndex).
 */
export function hypothesisIdForDeterminationIndex(run: ResearchRun, index: number): string | null {
  return run.research_graph[index]?.id ?? null;
}

export function isHypothesisVisible(run: ResearchRun, _hypothesisId: string, replayedIds: Set<string>): boolean {
  const trigger = run.trace_events.find((e) => e.phase === "task_graph" && e.status === "done");
  if (!trigger) return false;
  return replayedIds.has(trigger.id);
}

export function isCoverageVisible(run: ResearchRun, replayedIds: Set<string>): boolean {
  const trigger = run.trace_events.find((e) => e.phase === "coverage" && e.status === "done");
  if (!trigger) return false;
  return replayedIds.has(trigger.id);
}

export type HypothesisVisualState = "pending" | "running" | "verified" | "failed" | "repairing";

export function getHypothesisState(
  run: ResearchRun,
  hypothesisId: string,
  replayedIds: Set<string>,
): HypothesisVisualState {
  const events = run.trace_events.filter((e) => e.artifact_id === hypothesisId && replayedIds.has(e.id));
  if (events.length === 0) {
    const fanout = run.trace_events.find((e) => e.actor === "research_pool" && e.phase === "fanout" && e.status === "running");
    if (fanout && replayedIds.has(fanout.id)) {
      const fanoutDone = run.trace_events.find((e) => e.actor === "research_pool" && e.phase === "fanout" && e.status === "done");
      if (!fanoutDone || !replayedIds.has(fanoutDone.id)) return "running";
      return "verified";
    }
    return "pending";
  }
  const last = events[events.length - 1];
  if (last.phase === "verification" && last.status === "failed") return "failed";
  if (last.phase === "repair_ticket") return "repairing";
  if (last.phase === "repair_verification" && last.status === "done") return "verified";
  if (last.phase === "repair_verification" && last.status === "needs_review") return "failed";
  return "verified";
}

export type FamilyReport = {
  family: CoverageFamily;
  familyStatus: CoverageFamilyStatus;
  determinations: Determination[];
  evidenceBundles: EvidenceBundle[];
  verdicts: VerificationVerdict[];
  repairTickets: RepairTicket[];
};

export function groupDeterminationsByFamily(run: ResearchRun): Map<CoverageFamily, FamilyReport> {
  const result = new Map<CoverageFamily, FamilyReport>();
  const familyStatusMap = new Map(run.coverage_family_statuses.map((s) => [s.family, s]));
  const evidenceByHyp = new Map(run.evidence_bundles.map((b) => [b.hypothesis_id, b]));
  const lastVerdictByHyp = new Map<string, VerificationVerdict>();
  for (const v of run.verification_verdicts) {
    lastVerdictByHyp.set(v.hypothesis_id, v);
  }
  const ticketsByHyp = new Map<string, RepairTicket[]>();
  for (const t of run.repair_tickets) {
    const existing = ticketsByHyp.get(t.hypothesis_id) ?? [];
    existing.push(t);
    ticketsByHyp.set(t.hypothesis_id, existing);
  }

  run.research_graph.forEach((hypothesis, index) => {
    const family = hypothesis.family;
    if (!result.has(family)) {
      const defaultStatus: CoverageFamilyStatus = familyStatusMap.get(family) ?? {
        id: `cf-${family}`,
        family,
        status: "active",
        reason: "",
        project_facts_considered: [],
        missing_facts: [],
      };
      result.set(family, {
        family,
        familyStatus: defaultStatus,
        determinations: [],
        evidenceBundles: [],
        verdicts: [],
        repairTickets: [],
      });
    }
    const group = result.get(family)!;

    const determination = run.determinations[index];
    if (determination) {
      group.determinations.push(determination);
    }

    const bundle = evidenceByHyp.get(hypothesis.id);
    if (bundle) {
      group.evidenceBundles.push(bundle);
    }

    const verdict = lastVerdictByHyp.get(hypothesis.id);
    if (verdict) {
      group.verdicts.push(verdict);
    }

    const tickets = ticketsByHyp.get(hypothesis.id);
    if (tickets) {
      group.repairTickets.push(...tickets);
    }
  });

  return result;
}
