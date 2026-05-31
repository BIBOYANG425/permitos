"use client";
import { useStore } from "@/lib/ui/store";
import { motion, AnimatePresence } from "framer-motion";

const STATUS_COLOR: Record<string, string> = {
  done: "text-teal-400",
  running: "text-cyan-300",
  failed: "text-red-400",
  needs_review: "text-amber-400",
  queued: "text-slate-500",
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
      <div className="brand-label mb-2.5" style={{ fontSize: 11 }}>Trace</div>
      {events.length === 0 && (
        <div className="text-xs text-slate-500 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          waiting…
        </div>
      )}
      <AnimatePresence mode="popLayout">
        {events.map((e) => (
          <motion.div
            key={e.id}
            className="grid grid-cols-[auto_1fr] gap-2.5 py-1.5 text-[11px] border-b border-dashed border-slate-800/40 text-slate-100"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            layout
          >
            <span
              className={`${STATUS_COLOR[e.status] ?? "text-slate-400"} min-w-[70px] font-mono font-medium`}
            >
              {e.phase}
            </span>
            <span className="text-slate-300">{e.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
