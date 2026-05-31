import type { EvidenceBundle, ResearchRun, ResearchRunInput, VerificationVerdict } from "./types";
import { parseScope, createRunId, projectFacts } from "./scope";
import { planResearch } from "./planner";
import { runLocalResearchPool } from "./workers";
import { repairEvidence, verifyEvidence } from "./verifier";
import { synthesize } from "./synthesis";
import { trace } from "./trace";
import { Raindrop } from "raindrop-ai";

const raindrop = new Raindrop({
  endpoint: process.env.RAINDROP_LOCAL_DEBUGGER,
});

export async function runResearch(input: ResearchRunInput): Promise<ResearchRun> {
  const run_id = createRunId();
  const interaction = raindrop.begin({
    eventId: run_id,
    event: "permit_research_run",
    input: input.project_description,
    properties: {
      project_description_chars: input.project_description.length,
      demo_documents_count: input.demo_documents.length,
      use_modal: process.env.USE_MODAL === "1",
    },
  });
  const trace_events = [
    trace(run_id, "scope_agent", "scope", "running", "Parsing intake into ScopePack")
  ];

  const scope_pack = parseScope(input, run_id);
  trace_events.push(trace(run_id, "scope_agent", "scope", "done", "ScopePack created", run_id));

  const plan = planResearch(scope_pack);
  trace_events.push(
    trace(
      run_id,
      "orchestrator",
      "coverage",
      "done",
      `Inspected ${plan.coverage_family_statuses.length} coverage families and created ${plan.regulatory_angles.length} regulatory angles`
    ),
    trace(
      run_id,
      "orchestrator",
      "task_graph",
      "done",
      `Created ${plan.research_graph.length} hypotheses and ${plan.research_tasks.length} source tasks`
    ),
    trace(run_id, "research_pool", "fanout", "running", `Launching ${plan.research_tasks.length} local async workers`)
  );

  const initialEvidence = await runLocalResearchPool(plan.research_tasks, plan.research_graph);
  trace_events.push(trace(run_id, "research_pool", "fanout", "done", "Local worker pool returned evidence bundles"));

  const evidence_bundles: EvidenceBundle[] = [...initialEvidence];
  const verification_verdicts: VerificationVerdict[] = [];
  const repair_tickets = [];

  for (const bundle of initialEvidence) {
    const verdict = verifyEvidence(scope_pack, bundle);
    verification_verdicts.push(verdict);

    if (verdict.verdict === "fail") {
      trace_events.push(
        trace(run_id, "verifier", "verification", "failed", `Verifier rejected ${bundle.hypothesis_id}`, bundle.hypothesis_id)
      );
    }

    for (const ticket of verdict.repair_tickets) {
      repair_tickets.push(ticket);
      trace_events.push(
        trace(run_id, "orchestrator", "repair_ticket", "queued", ticket.observed_problem, ticket.ticket_id)
      );

      const repairedEvidence = repairEvidence(scope_pack, ticket);
      evidence_bundles.push(repairedEvidence);
      const repairedVerdict = verifyEvidence(scope_pack, repairedEvidence);
      verification_verdicts.push(repairedVerdict);
      trace_events.push(
        trace(
          run_id,
          "verifier",
          "repair_verification",
          repairedVerdict.verdict === "pass" ? "done" : "needs_review",
          `Repair verdict for ${ticket.hypothesis_id}: ${repairedVerdict.verdict}`,
          ticket.hypothesis_id
        )
      );
    }
  }

  const latestVerdicts = latestByHypothesis(verification_verdicts);
  const latestEvidence = latestByHypothesis(evidence_bundles);
  const synthesis = synthesize(scope_pack, plan.research_graph, plan.regulatory_angles, latestEvidence, latestVerdicts);
  trace_events.push(trace(run_id, "synthesis_agent", "matrix", "done", "Applicability matrix synthesized"));

  const status = synthesis.determinations.some((row) => row.review_flag) ? "needs_review" : "done";

  const result: ResearchRun = {
    run_id,
    status,
    project_facts: projectFacts(scope_pack),
    jurisdiction_stack: scope_pack.facility.jurisdiction_stack,
    scope_pack,
    coverage_family_statuses: plan.coverage_family_statuses,
    regulatory_angles: plan.regulatory_angles,
    research_graph: plan.research_graph,
    research_tasks: plan.research_tasks,
    evidence_bundles: latestEvidence,
    verification_verdicts: latestVerdicts,
    repair_tickets,
    memory_updates: synthesis.memory_updates,
    determinations: synthesis.determinations,
    trace_events,
    report_markdown: synthesis.report_markdown
  };

  interaction.setProperties({
    status,
    hypotheses_count: plan.research_graph.length,
    tasks_count: plan.research_tasks.length,
    evidence_bundles_count: latestEvidence.length,
    verdicts_count: latestVerdicts.length,
    repair_tickets_count: repair_tickets.length,
    determinations_count: synthesis.determinations.length,
    needs_review_count: synthesis.determinations.filter((d) => d.review_flag).length,
    trace_events_count: trace_events.length,
  });
  // Fire-and-forget — don't block the API response on Workshop ingestion.
  void interaction
    .finish({ output: synthesis.report_markdown.slice(0, 2000) })
    .then(() => raindrop.flush())
    .catch(() => {
      // Workshop not running / Raindrop unreachable → silent in demo.
    });

  return result;
}

function latestByHypothesis<T extends { hypothesis_id: string }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.hypothesis_id, item);
  }
  return [...map.values()];
}
