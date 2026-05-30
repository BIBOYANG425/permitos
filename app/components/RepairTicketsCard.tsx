"use client";
import { useStore } from "@/lib/ui/store";

export function RepairTicketsCard() {
  const run = useStore((s) => s.run);
  const replayed = useStore((s) => s.replayedEventIds);
  if (!run || run.repair_tickets.length === 0) return null;
  return (
    <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8 }}>Repair tickets</div>
      {run.repair_tickets.map((t) => {
        const repairEvent = run.trace_events.find((e) => e.phase === "repair_verification" && e.artifact_id === t.hypothesis_id);
        const resolved = repairEvent ? replayed.has(repairEvent.id) : false;
        return (
          <div key={t.ticket_id} style={{ padding: 8, background: resolved ? "rgba(62,207,142,0.10)" : "rgba(245,158,11,0.10)", border: `1px solid ${resolved ? "var(--green)" : "var(--orange)"}`, borderRadius: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{t.hypothesis_id}</div>
            <div style={{ fontSize: 12, margin: "4px 0" }}>Observed: {t.observed_problem}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Action: {t.repair_action}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: resolved ? "var(--green)" : "var(--orange)" }}>{resolved ? "✓ resolved" : "🔧 repairing…"}</div>
          </div>
        );
      })}
    </div>
  );
}
