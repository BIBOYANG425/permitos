import { useEffect, useRef } from "react";
import { useStore } from "./store";

const DELAYS_MS: Record<string, number> = {
  "scope_agent/scope/running": 0,
  "scope_agent/scope/done": 400,
  "orchestrator/coverage/done": 400,
  "orchestrator/task_graph/done": 600,
  "research_pool/fanout/running": 300,
  "research_pool/fanout/done": 1200,
  "verifier/verification/failed": 500,
  "orchestrator/repair_ticket/queued": 600,
  "verifier/repair_verification/done": 1500,
  "verifier/repair_verification/needs_review": 1500,
  "synthesis_agent/matrix/done": 500,
};
const DEFAULT_DELAY = 300;

function delayFor(actor: string, phase: string, status: string) {
  return DELAYS_MS[`${actor}/${phase}/${status}`] ?? DEFAULT_DELAY;
}

export function useReplay() {
  const run = useStore((s) => s.run);
  const speed = useStore((s) => s.replaySpeed);
  const tickReplay = useStore((s) => s.tickReplay);
  const finishReplay = useStore((s) => s.finishReplay);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!run) return;
    cancelRef.current = false;
    const events = [...run.trace_events].sort((a, b) => a.ts.localeCompare(b.ts));
    let acc = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const ev of events) {
      acc += delayFor(ev.actor, ev.phase, ev.status) / speed;
      const t = setTimeout(() => {
        if (cancelRef.current) return;
        tickReplay(ev.id);
      }, acc);
      timers.push(t);
    }
    const done = setTimeout(() => {
      if (!cancelRef.current) finishReplay();
    }, acc + 200);
    timers.push(done);
    return () => {
      cancelRef.current = true;
      timers.forEach(clearTimeout);
    };
  }, [run, speed, tickReplay, finishReplay]);
}

export function skipReplay() {
  const { run, tickReplay, finishReplay } = useStore.getState();
  if (!run) return;
  for (const ev of run.trace_events) tickReplay(ev.id);
  finishReplay();
}
