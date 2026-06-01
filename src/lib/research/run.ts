import type { Determination, EvidenceBundle, RepairTicket, ResearchHypothesis, ResearchRun, ResearchRunInput, ResearchTask, VerificationVerdict } from "./types";
import type { SdsReview } from "@/lib/sds/types";
import { parseScope, applySdsHandoffToScope, createRunId, projectFacts } from "./scope";
import { planResearch } from "./planner";
import { sdsActiveFamilies } from "./sdsFamilies";
import { runLocalResearchPool } from "./workers";
import { blockedToolIdsForRole, researchWorkerToolIds } from "./toolCatalog";
import { repairEvidence, verifyEvidence } from "./verifier";
import { synthesize } from "./synthesis";
import { PROGRAM_REGISTRY, type ProgramRegistryEntry } from "./programRegistry";
import { verifyDeterminationSet } from "./completeness";
import { trace } from "./trace";
import { getResearchMode } from "./researchMode";
import { runOrchestrationBriefing } from "./orchestration";
import { reviewSdsInputs } from "@/lib/sds/reviewer";
import { Raindrop } from "raindrop-ai";

const raindrop = new Raindrop({
  endpoint: process.env.RAINDROP_LOCAL_DEBUGGER,
});

export type PlannedRun = {
  run_id: string;
  scope_pack: Awaited<ReturnType<typeof parseScope>>;
  plan: ReturnType<typeof planResearch>;
  sds_reviews: SdsReview[];
  trace_events: ReturnType<typeof trace>[];
};

export async function planRun(input: ResearchRunInput): Promise<PlannedRun> {
  const run_id = createRunId();
  const sds_reviews = reviewSdsInputs(input.demo_documents ?? [], run_id, { asOfDate: new Date() });
  const trace_events = [trace(run_id, "scope_agent", "scope", "running", "Parsing intake into ScopePack")];
  const base_scope_pack = await parseScope(input, run_id);
  trace_events.push(trace(run_id, "scope_agent", "scope", "done", "ScopePack created", run_id));

  for (const review of sds_reviews) {
    trace_events.push(
      trace(run_id, "sds_reviewer", "sds_review",
        review.overall_status === "unreadable" ? "needs_review" : "done",
        `Reviewed SDS ${review.document.name}: ${review.overall_status}`, review.document.id)
    );
  }

  // Fold SDS handoff facts into scope and let the planner open the coverage
  // families those facts flag (e.g. a VOC SDS opens air even with no equipment).
  const scope_pack = applySdsHandoffToScope(base_scope_pack, sds_reviews);
  const plan = planResearch(scope_pack, sdsActiveFamilies(sds_reviews));
  trace_events.push(
    trace(run_id, "orchestrator", "coverage", "done",
      `Inspected ${plan.coverage_family_statuses.length} coverage families and created ${plan.regulatory_angles.length} regulatory angles`),
    trace(run_id, "orchestrator", "task_graph", "done",
      `Created ${plan.research_graph.length} hypotheses and ${plan.research_tasks.length} source tasks`)
  );
  return { run_id, scope_pack, plan, sds_reviews, trace_events };
}

export async function finalizeRun(
  run_id: string,
  scope_pack: PlannedRun["scope_pack"],
  plan: PlannedRun["plan"],
  initialEvidence: EvidenceBundle[],
  baseTrace: ReturnType<typeof trace>[],
  sds_reviews: SdsReview[] = []
): Promise<ResearchRun> {
  const trace_events = [...baseTrace];
  const evidence_bundles: EvidenceBundle[] = [...initialEvidence];
  const verification_verdicts: VerificationVerdict[] = [];
  const repair_tickets = [];
  const hypothesisById = new Map(plan.research_graph.map((h) => [h.id, h]));

  for (const bundle of initialEvidence) {
    const verdict = verifyEvidence(scope_pack, bundle);
    verification_verdicts.push(verdict);
    if (verdict.verdict === "fail") {
      trace_events.push(trace(run_id, "verifier", "verification", "failed", `Verifier rejected ${bundle.hypothesis_id}`, bundle.hypothesis_id));
    }
    for (const ticket of verdict.repair_tickets) {
      repair_tickets.push(ticket);
      trace_events.push(trace(run_id, "orchestrator", "repair_ticket", "queued", ticket.observed_problem, ticket.ticket_id));
      const repairedEvidence = await repairBundle(scope_pack, ticket, hypothesisById);
      evidence_bundles.push(repairedEvidence);
      const repairedVerdict = verifyEvidence(scope_pack, repairedEvidence);
      verification_verdicts.push(repairedVerdict);
      trace_events.push(trace(run_id, "verifier", "repair_verification", repairedVerdict.verdict === "pass" ? "done" : "needs_review",
        `Repair verdict for ${ticket.hypothesis_id}: ${repairedVerdict.verdict}`, ticket.hypothesis_id));
    }
  }

  const latestVerdicts = latestByHypothesis(verification_verdicts);
  const latestEvidence = latestByHypothesis(evidence_bundles);
  const synthesis = synthesize(scope_pack, plan.research_graph, plan.regulatory_angles, latestEvidence, latestVerdicts, sds_reviews);
  trace_events.push(trace(run_id, "synthesis_agent", "matrix", "done", "Applicability matrix synthesized"));

  // Recall floor: re-derive the EXPECTED program set from the registry x scope and
  // flag any program that was never investigated. The per-hypothesis verifier only
  // sees the proposed set, so it is blind to a wholly-missed family; this catches it
  // and surfaces it as a needs_review row instead of shipping the run as "complete".
  const investigatedHypotheses = new Set(plan.research_graph.map((h) => h.id));
  const proposedProgramIds = PROGRAM_REGISTRY.filter((program) =>
    program.hypothesis_ids.some((hid) => investigatedHypotheses.has(hid)),
  ).map((program) => program.id);
  const recall = verifyDeterminationSet(scope_pack, proposedProgramIds);
  for (const program of recall.missing) {
    trace_events.push(
      trace(run_id, "verifier", "recall_floor", "needs_review",
        `Recall gap: ${program.name} is expected for this scope but was never investigated`, program.id),
    );
  }

  const determinations = [...synthesis.determinations, ...recall.missing.map(recallGapDetermination)];
  const status = determinations.some((row) => row.review_flag) ? "needs_review" : "done";

  return {
    run_id, status,
    project_facts: projectFacts(scope_pack),
    jurisdiction_stack: scope_pack.facility.jurisdiction_stack,
    scope_pack,
    sds_reviews,
    coverage_family_statuses: plan.coverage_family_statuses,
    regulatory_angles: plan.regulatory_angles,
    research_graph: plan.research_graph,
    research_tasks: plan.research_tasks,
    evidence_bundles: latestEvidence,
    verification_verdicts: latestVerdicts,
    repair_tickets,
    memory_updates: synthesis.memory_updates,
    determinations,
    trace_events,
    report_markdown: synthesis.report_markdown,
  };
}

// Production repair: re-run the real research agent for the failed hypothesis with a
// bounded, quote-constraining instruction (live/modal modes). In fixture mode there is
// no agent to re-run, so the canned demo repair stands in. One bounded attempt — the
// re-verify decides pass vs. needs_review; we never loop.
async function repairBundle(
  scope: PlannedRun["scope_pack"],
  ticket: RepairTicket,
  hypothesisById: Map<string, ResearchHypothesis>,
): Promise<EvidenceBundle> {
  if (getResearchMode() === "fixture") {
    return repairEvidence(scope, ticket);
  }
  const hypothesis = hypothesisById.get(ticket.hypothesis_id);
  if (!hypothesis) {
    return repairEvidence(scope, ticket);
  }
  const repairTask: ResearchTask = {
    task_id: `RPT-${ticket.hypothesis_id.replace(/^H-/, "")}`,
    hypothesis_id: ticket.hypothesis_id,
    assigned_agent: `${hypothesis.family}_researcher`,
    allowed_tools: researchWorkerToolIds(),
    blocked_tools: blockedToolIdsForRole("researcher"),
    budget: { max_sources: 2, max_runtime_seconds: 30, max_model_calls: 3 },
    repair_instruction:
      `${ticket.repair_action}. Constrain the verbatim_quote strictly to text present in the fetched source; ` +
      "if you cannot ground it, return applies=needs_review with an empty verbatim_quote.",
  };
  const result = await runLocalResearchPool([repairTask], [hypothesis]);
  return result.bundles[0] ?? repairEvidence(scope, ticket);
}

// A determination row for a program the registry expected for this scope but that
// no hypothesis investigated. Honest by construction: unverified, zero confidence,
// flagged for review — never presented as a settled "yes"/"no".
function recallGapDetermination(program: ProgramRegistryEntry): Determination {
  return {
    requirement: program.name,
    applies: "needs_review",
    trigger: `Expected for this project scope but never investigated (${program.jurisdiction}).`,
    project_fact: `Recall gap — ${program.family} family program was not proposed`,
    citation: "No research performed — flagged by the recall floor",
    quote: program.what_it_does,
    source_url: program.authority_source_url,
    confidence: 0,
    verified: false,
    review_flag: true,
  } satisfies Determination;
}

export async function runResearch(input: ResearchRunInput): Promise<ResearchRun> {
  const planned = await planRun(input);
  const { run_id } = planned;

  // Standing orchestration tier: a real LLM reasoning pass over the decomposition,
  // recorded in the trace. Fail-soft and additive (never changes determinations);
  // skipped in fixture mode so demo/offline runs stay deterministic.
  if (getResearchMode() !== "fixture") {
    const brief = await runOrchestrationBriefing({
      scope: planned.scope_pack,
      coverage_family_statuses: planned.plan.coverage_family_statuses,
      regulatory_angles: planned.plan.regulatory_angles,
      research_graph: planned.plan.research_graph,
    });
    if (brief) {
      planned.trace_events.push(trace(run_id, "orchestrator", "briefing", "done", brief.slice(0, 400)));
    }
  }

  const interaction = raindrop.begin({
    eventId: run_id,
    event: "permit_research_run",
    userId: "permitpilot-demo",
    input: input.project_description,
    properties: {
      project_description_chars: input.project_description.length,
      demo_documents_count: input.demo_documents?.length ?? 0,
      research_mode: getResearchMode(),
    },
  });
  const fanoutTrace = [...planned.trace_events,
    trace(run_id, "research_pool", "fanout", "running", `Launching ${planned.plan.research_tasks.length} local async workers`)];
  const poolResult = await runLocalResearchPool(planned.plan.research_tasks, planned.plan.research_graph);
  if (poolResult.degraded) {
    fanoutTrace.push(
      trace(run_id, "research_pool", "fanout", "needs_review",
        `⚠ Modal unreachable — using cached fixtures (${poolResult.degraded.reason})`)
    );
  } else {
    fanoutTrace.push(trace(run_id, "research_pool", "fanout", "done", "Research worker pool returned evidence bundles"));
  }
  const result = await finalizeRun(run_id, planned.scope_pack, planned.plan, poolResult.bundles, fanoutTrace, planned.sds_reviews);
  interaction.setProperties({
    status: result.status,
    hypotheses_count: planned.plan.research_graph.length,
    tasks_count: planned.plan.research_tasks.length,
    evidence_bundles_count: result.evidence_bundles.length,
    verdicts_count: result.verification_verdicts.length,
    repair_tickets_count: result.repair_tickets.length,
    determinations_count: result.determinations.length,
    needs_review_count: result.determinations.filter((d) => d.review_flag).length,
    trace_events_count: result.trace_events.length,
  });

  // Real LLM-as-judge — independent GPT pass over the FINAL HMBP determination.
  // Doesn't override verifier verdict (preserves HMBP fail→repair demo); attaches
  // concurrence + reasoning as Raindrop trace properties so evaluators can see
  // a real LLM reasoning about real evidence inside the harness.
  await runLlmJudgeOnHmbp(interaction, result.evidence_bundles, result.verification_verdicts, result.trace_events, run_id);

  // Fire-and-forget — don't block the API response on Workshop ingestion.
  // SDK auto-flushes via internal timer; no external flush needed.
  void interaction
    .finish({ output: result.report_markdown.slice(0, 2000) })
    .catch(() => {
      // Workshop not running / Raindrop unreachable → silent in demo.
    });

  return result;
}

async function runLlmJudgeOnHmbp(
  interaction: ReturnType<Raindrop["begin"]>,
  evidence: EvidenceBundle[],
  verdicts: VerificationVerdict[],
  trace_events: ResearchRun["trace_events"],
  run_id: string,
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    interaction.setProperty("llm_judge", "skipped: OPENAI_API_KEY not set");
    return;
  }

  const hmbpEvidence = evidence.find((e) => e.hypothesis_id === "H-HAZMAT-HMBP");
  const hmbpVerdict = verdicts.find((v) => v.hypothesis_id === "H-HAZMAT-HMBP");
  if (!hmbpEvidence || !hmbpVerdict || hmbpEvidence.sources.length === 0) {
    interaction.setProperty("llm_judge", "skipped: HMBP evidence missing");
    return;
  }

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey });
    const quote = hmbpEvidence.sources[0].quote;
    const claim = hmbpEvidence.extracted_claims[0]?.value ?? "(no claim extracted)";
    const verdictStr = hmbpVerdict.verdict;

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_INTAKE_MODEL ?? "gpt-4o-mini",
      max_tokens: 250,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You are an EHS compliance auditor independently reviewing a verifier verdict. Given the source quote, the extracted claim, and the verifier verdict, judge whether the quote actually supports the claim and verdict. Respond with strict JSON: {"concurs": boolean, "reasoning": string (one sentence)}.',
        },
        {
          role: "user",
          content: `Source quote: ${quote}\n\nExtracted claim: ${claim}\n\nVerifier verdict: ${verdictStr}\n\nDoes the quote support the claim and verdict?`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { concurs?: boolean; reasoning?: string };
    interaction.setProperties({
      llm_judge_concurs: parsed.concurs === true,
      llm_judge_verdict_under_review: verdictStr,
      llm_judge_reasoning: String(parsed.reasoning ?? ""),
    });
    trace_events.push({
      id: `${run_id}-llm-judge`,
      run_id,
      ts: new Date().toISOString(),
      actor: "verifier",
      phase: "llm_judge",
      status: parsed.concurs ? "done" : "needs_review",
      message: `LLM judge ${parsed.concurs ? "concurs" : "dissents"}: ${String(parsed.reasoning ?? "")}`,
    });
  } catch (error) {
    // fail-soft — LLM judge is supplementary, never blocks the run
    interaction.setProperty(
      "llm_judge_error",
      error instanceof Error ? error.message.slice(0, 200) : "unknown",
    );
  }
}

function latestByHypothesis<T extends { hypothesis_id: string }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.hypothesis_id, item);
  }
  return [...map.values()];
}
