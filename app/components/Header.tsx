"use client";
import { useStore } from "@/lib/ui/store";

export function Header() {
  const run = useStore((s) => s.run);
  const reset = useStore((s) => s.reset);
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900">
      <div className="font-semibold tracking-tight text-slate-100">
        PermitPilot <span className="text-slate-500">·</span> Truth Engine
      </div>
      <div className="flex gap-4 items-center text-xs text-slate-400">
        {run && (
          <span>
            run: <code className="text-slate-300">{run.run_id}</code>
          </span>
        )}
        {run && (
          <span>
            status:{" "}
            <b className={run.status === "done" ? "text-emerald-500" : "text-amber-500"}>
              {run.status}
            </b>
          </span>
        )}
        <button
          onClick={reset}
          className="px-2.5 py-1 bg-transparent text-slate-400 border border-slate-700 rounded-md cursor-pointer hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
          Reset
        </button>
      </div>
    </header>
  );
}
