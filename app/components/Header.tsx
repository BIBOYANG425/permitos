"use client";
import { useStore } from "@/lib/ui/store";
import { Activity, RotateCcw } from "lucide-react";

export function Header() {
  const run = useStore((s) => s.run);
  const reset = useStore((s) => s.reset);
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60 bg-slate-900/80 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="brand-label">PermitOS</div>
        <span className="text-slate-600">|</span>
        <span className="text-xs text-slate-400 tracking-wide">
          Regulatory Research Command Center
        </span>
      </div>
      <div className="flex gap-4 items-center text-xs text-slate-400">
        {run && (
          <span className="flex items-center gap-1.5 font-mono">
            <Activity size={12} className="text-slate-500" />
            <code className="text-slate-300">{run.run_id.slice(0, 8)}</code>
          </span>
        )}
        {run && (
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                run.status === "done" ? "bg-teal-400 glow-verified" : "bg-amber-400 animate-pulse"
              }`}
            />
            <b className={run.status === "done" ? "text-teal-400" : "text-amber-400"}>
              {run.status}
            </b>
          </span>
        )}
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-2.5 py-1 text-slate-400 border border-slate-700/60 rounded-md cursor-pointer hover:bg-slate-800 hover:text-slate-100 hover:border-slate-600 transition-all bg-transparent"
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </div>
    </header>
  );
}
