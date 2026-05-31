"use client";
import { useStore, type MatrixFilter } from "@/lib/ui/store";
import { getVerificationCounts } from "@/lib/ui/selectors";
import { CheckCircle2, AlertTriangle, XCircle, Wrench, Lock } from "lucide-react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

type Row = { label: string; count: string; color: string; key: MatrixFilter; Icon: LucideIcon };

export function VerificationSummary() {
  const run = useStore((s) => s.run);
  const setFilter = useStore((s) => s.setMatrixFilter);
  const filter = useStore((s) => s.matrixFilter);
  if (!run) return null;
  const c = getVerificationCounts(run);
  const rows: Row[] = [
    { label: "Verified", count: `${c.verified}`, color: "text-teal-400", key: "verified", Icon: CheckCircle2 },
    { label: "Needs Review", count: `${c.needs_review}`, color: "text-amber-400", key: "needs_review", Icon: AlertTriangle },
    {
      label: "Failed",
      count: c.repairs_ran > 0 ? `${c.failed_open} / was ${c.repairs_ran}` : `${c.failed_open}`,
      color: "text-red-400",
      key: "failed",
      Icon: XCircle,
    },
    { label: "Repairs ran", count: `${c.repairs_ran}`, color: "text-orange-400", key: "all", Icon: Wrench },
    { label: "Blocked", count: `${c.blocked}`, color: "text-slate-500", key: "blocked", Icon: Lock },
  ];
  return (
    <div className="p-3 border-b border-slate-800/40">
      <div className="brand-label mb-2.5" style={{ fontSize: 11 }}>
        Verification
      </div>
      {rows.map(({ label, count, color, key, Icon }, i) => (
        <motion.button
          key={label}
          onClick={() => setFilter(key)}
          className={`flex items-center justify-between w-full px-2.5 py-1.5 mb-0.5 rounded-lg text-xs text-slate-100 transition-all duration-200 border-0 cursor-pointer ${
            filter === key ? "glass" : "bg-transparent hover:bg-slate-800/40"
          }`}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04, duration: 0.25 }}
          whileTap={{ scale: 0.98 }}
        >
          <span className={`flex items-center gap-1.5 ${color}`}>
            <Icon size={12} />
            {label}
          </span>
          <span className="tabular-nums font-mono text-slate-300">{count}</span>
        </motion.button>
      ))}
    </div>
  );
}
