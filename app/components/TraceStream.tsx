"use client";
import { useStore } from "@/lib/ui/store";

const STATUS_COLOR: Record<string, string> = {
  done: "var(--green)", running: "var(--accent)", failed: "var(--red)",
  needs_review: "var(--yellow)", queued: "var(--text-dim)",
};

export function TraceStream() {
  const run = useStore((s) => s.run);
  const replayed = useStore((s) => s.replayedEventIds);
  if (!run) return null;
  const events = [...run.trace_events].sort((a, b) => a.ts.localeCompare(b.ts)).filter((e) => replayed.has(e.id));
  return (
    <div style={{ padding: 12, flex: 1, overflowY: "auto" }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8 }}>Trace</div>
      {events.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>(waiting…)</div>}
      {events.map((e) => (
        <div key={e.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, padding: "4px 0", fontSize: 11, borderBottom: "1px dashed var(--border)" }}>
          <span style={{ color: STATUS_COLOR[e.status] ?? "var(--text-dim)", minWidth: 70 }}>{e.phase}</span>
          <span>{e.message}</span>
        </div>
      ))}
    </div>
  );
}
