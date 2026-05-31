"use client";
import { useStore } from "@/lib/ui/store";
import { motion } from "framer-motion";

const STATUS_STYLE: Record<string, { color: string; dot: string }> = {
  active: { color: "text-teal-400", dot: "bg-teal-400" },
  blocked_missing_fact: { color: "text-amber-400", dot: "bg-amber-400" },
  out_of_scope: { color: "text-slate-500", dot: "bg-slate-600" },
  discovery_candidate: { color: "text-cyan-300", dot: "bg-cyan-300" },
};

export function CoverageFamilyList() {
  const run = useStore((s) => s.run);
  if (!run) return null;
  return (
    <div className="p-3 border-b border-slate-800/40">
      <div className="brand-label mb-2.5" style={{ fontSize: 11 }}>
        Coverage families
      </div>
      {run.coverage_family_statuses.map((c, i) => {
        const style = STATUS_STYLE[c.status] ?? { color: "text-slate-400", dot: "bg-slate-500" };
        return (
          <motion.div
            key={c.id}
            className="flex items-center justify-between py-1.5 text-xs text-slate-100"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03, duration: 0.25 }}
          >
            <span className="capitalize">{c.family.replace(/_/g, " ")}</span>
            <span className={`flex items-center gap-1.5 text-[11px] ${style.color}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${style.dot}`} />
              {c.status.replace(/_/g, " ")}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
