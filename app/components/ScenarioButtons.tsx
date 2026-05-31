"use client";
import { SCENARIOS } from "@/lib/ui/scenarios";
import { useStore } from "@/lib/ui/store";
import { Zap } from "lucide-react";
import { motion } from "framer-motion";

export function ScenarioButtons() {
  const startRun = useStore((s) => s.startRun);
  const isRunning = useStore((s) => s.isRunning);
  return (
    <div className="flex flex-col gap-2">
      <div className="brand-label" style={{ fontSize: 11 }}>
        Sample scenarios
      </div>
      {SCENARIOS.map((s, i) => (
        <motion.button
          key={s.id}
          disabled={isRunning}
          onClick={() => startRun(s.payload)}
          className="p-3 glass rounded-xl text-left text-slate-100 transition-all duration-200 disabled:opacity-40 disabled:cursor-wait cursor-pointer hover:bg-slate-800/80 group border-0"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06, duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Zap size={12} className="text-cyan-300/60 group-hover:text-cyan-300 transition-colors" />
            {s.label}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 ml-5">{s.subtitle}</div>
        </motion.button>
      ))}
    </div>
  );
}
