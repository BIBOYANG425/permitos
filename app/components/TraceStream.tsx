"use client";
import { useStore } from "@/lib/ui/store";

const STATUS_COLOR: Record<string, string> = {
  done: "text-emerald-500",
  running: "text-sky-400",
  failed: "text-red-500",
  needs_review: "text-amber-500",
  queued: "text-slate-400",
};

export function TraceStream() {
  const run = useStore((s) => s.run);
  const replayed = useStore((s) => s.replayedEventIds);
  if (!run) return null;
  const events = [...run.trace_events]
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .filter((e) => replayed.has(e.id));
  return (
    <div className="p-3 flex-1 overflow-y-auto">
      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-2">Trace</div>
      {events.length === 0 && (
        <div className="text-xs text-slate-400">(waiting…)</div>
      )}
      {events.map((e) => (
        <div
          key={e.id}
          className="grid grid-cols-[auto_1fr] gap-2 py-1 text-[11px] border-b border-dashed border-slate-800 text-slate-100"
        >
          <span
            className={`${STATUS_COLOR[e.status] ?? "text-slate-400"} min-w-[70px] font-mono`}
          >
            {e.phase}
          </span>
          <span>{e.message}</span>
        </div>
      ))}
    </div>
  );
}
