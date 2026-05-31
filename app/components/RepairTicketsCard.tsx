"use client";
import { useStore } from "@/lib/ui/store";
import { CheckCircle2, Wrench } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function RepairTicketsCard() {
  const run = useStore((s) => s.run);
  const replayed = useStore((s) => s.replayedEventIds);
  if (!run || run.repair_tickets.length === 0) return null;
  return (
    <div className="p-3 border-b border-slate-800/40">
      <div className="brand-label mb-2.5" style={{ fontSize: 11 }}>
        Repair tickets
      </div>
      <AnimatePresence mode="popLayout">
        {run.repair_tickets.map((t, i) => {
          const repairEvent = run.trace_events.find(
            (e) => e.phase === "repair_verification" && e.artifact_id === t.hypothesis_id
          );
          const resolved = repairEvent ? replayed.has(repairEvent.id) : false;
          return (
            <motion.div
              key={t.ticket_id}
              className={`p-2.5 rounded-xl mb-1.5 border transition-all duration-300 ${
                resolved
                  ? "bg-teal-500/8 border-teal-500/40 glow-verified"
                  : "bg-orange-500/8 border-orange-500/40"
              }`}
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              layout
            >
              <div className="text-[11px] text-slate-500 font-mono">{t.hypothesis_id}</div>
              <div className="text-xs my-1 text-slate-100">{t.observed_problem}</div>
              <div className="text-[11px] text-slate-400">{t.repair_action}</div>
              <div className={`flex items-center gap-1 text-[11px] mt-1.5 font-medium ${resolved ? "text-teal-400" : "text-orange-400"}`}>
                {resolved ? <CheckCircle2 size={11} /> : <Wrench size={11} className="animate-pulse" />}
                {resolved ? "resolved" : "repairing…"}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
