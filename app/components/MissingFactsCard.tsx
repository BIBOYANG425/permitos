"use client";
import { useStore } from "@/lib/ui/store";
import { AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

export function MissingFactsCard() {
  const run = useStore((s) => s.run);
  const missing = run?.scope_pack?.missing_facts ?? [];
  if (missing.length === 0) return null;
  return (
    <motion.div
      className="glass rounded-xl p-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-1.5 mb-2" style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase" as const, color: "#f59e0b", fontWeight: 600 }}>
        <AlertTriangle size={11} />
        Missing facts ({missing.length})
      </div>
      {missing.map((m) => (
        <div key={m.field} className="mb-2.5 last:mb-0">
          <div className="text-xs text-amber-400 font-medium">{m.field}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{m.why_needed}</div>
          <div className="text-[11px] text-slate-500">Blocks: {m.blocks.join(", ")}</div>
          <input
            disabled
            placeholder="Provide value (v2)"
            title="v2 feature"
            className="mt-1.5 w-full px-2 py-1.5 bg-slate-950/60 text-slate-400 border border-slate-700/40 rounded-lg text-xs cursor-not-allowed"
          />
        </div>
      ))}
    </motion.div>
  );
}
