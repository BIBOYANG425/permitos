"use client";
import { useStore } from "@/lib/ui/store";
import { Activity, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";

export function Header() {
  const run = useStore((s) => s.run);
  const reset = useStore((s) => s.reset);
  return (
    <motion.header
      className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60 bg-slate-900/80 backdrop-blur-md"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center gap-3">
        <motion.div
          className="brand-label"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          PermitOS
        </motion.div>
        <span className="text-slate-600">|</span>
        <span className="text-xs text-slate-400 tracking-wide">
          Regulatory Research Command Center
        </span>
      </div>
      <div className="flex gap-4 items-center text-xs text-slate-400">
        {run && (
          <motion.span
            className="flex items-center gap-1.5 font-mono"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Activity size={12} className="text-slate-500" />
            <code className="text-slate-300">{run.run_id.slice(0, 8)}</code>
          </motion.span>
        )}
        {run && (
          <motion.span
            className="flex items-center gap-1.5"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                run.status === "done" ? "bg-teal-400 glow-verified" : "bg-amber-400 animate-pulse"
              }`}
            />
            <b className={run.status === "done" ? "text-teal-400" : "text-amber-400"}>
              {run.status}
            </b>
          </motion.span>
        )}
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-2.5 py-1 text-slate-400 border border-slate-700/60 rounded-md cursor-pointer hover:bg-slate-800 hover:text-slate-100 hover:border-slate-600 transition-all bg-transparent"
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </div>
    </motion.header>
  );
}
