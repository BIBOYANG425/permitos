"use client";
import { useStore } from "@/lib/ui/store";

export function RepairTicketsCard() {
  const run = useStore((s) => s.run);
  const replayed = useStore((s) => s.replayedEventIds);
  if (!run || run.repair_tickets.length === 0) return null;
  return (
    <div className="p-3 border-b border-slate-800">
      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-2">
        Repair tickets
      </div>
      {run.repair_tickets.map((t) => {
        const repairEvent = run.trace_events.find(
          (e) => e.phase === "repair_verification" && e.artifact_id === t.hypothesis_id
        );
        const resolved = repairEvent ? replayed.has(repairEvent.id) : false;
        return (
          <div
            key={t.ticket_id}
            className={`p-2 rounded-md mb-1.5 border transition-colors ${
              resolved
                ? "bg-emerald-500/10 border-emerald-500"
                : "bg-orange-500/10 border-orange-500"
            }`}
          >
            <div className="text-[11px] text-slate-400">{t.hypothesis_id}</div>
            <div className="text-xs my-1 text-slate-100">Observed: {t.observed_problem}</div>
            <div className="text-[11px] text-slate-400">Action: {t.repair_action}</div>
            <div
              className={`text-[11px] mt-1 ${
                resolved ? "text-emerald-500" : "text-orange-500"
              }`}
            >
              {resolved ? "✓ resolved" : "🔧 repairing…"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
