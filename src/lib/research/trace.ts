import type { TraceEvent } from "./types";

export function trace(
  run_id: string,
  actor: string,
  phase: string,
  status: TraceEvent["status"],
  message: string,
  artifact_id?: string
): TraceEvent {
  return {
    id: `trace_${actor}_${phase}_${artifact_id ?? Math.random().toString(36).slice(2)}`,
    run_id,
    ts: new Date().toISOString(),
    actor,
    phase,
    status,
    message,
    artifact_id
  };
}
