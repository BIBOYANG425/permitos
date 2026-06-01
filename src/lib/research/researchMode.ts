// How the research pool executes a run. Single switch read by workers.ts:
//
//   live    — in-process agentic LLM researcher (liveWorker.ts): real model loop,
//             real allowlisted fetch, grounded extraction. The production default
//             whenever an OpenAI key is present.
//   modal   — fan out to the deployed Modal worker (modal/researchPool.ts).
//   fixture — deterministic cached evidence (workers.ts runFixturePool). Demo/offline
//             only; an honest, clearly-degraded fallback, never the production path.
//
// Resolution order (first match wins):
//   1. RESEARCH_MODE env, if it is one of the three modes.
//   2. USE_MODAL=1 (legacy switch) -> modal.
//   3. OPENAI_API_KEY present -> live.
//   4. otherwise -> fixture (fail-closed: no key means no real research).
export type ResearchMode = "live" | "modal" | "fixture";

export function getResearchMode(): ResearchMode {
  const explicit = process.env.RESEARCH_MODE?.trim().toLowerCase();
  if (explicit === "live" || explicit === "modal" || explicit === "fixture") {
    return explicit;
  }
  if (process.env.USE_MODAL === "1") {
    return "modal";
  }
  if (process.env.OPENAI_API_KEY) {
    return "live";
  }
  return "fixture";
}

export function isLiveMode(): boolean {
  return getResearchMode() === "live";
}
