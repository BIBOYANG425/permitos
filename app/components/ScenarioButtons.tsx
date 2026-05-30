"use client";
import { SCENARIOS } from "@/lib/ui/scenarios";
import { useStore } from "@/lib/ui/store";

export function ScenarioButtons() {
  const startRun = useStore((s) => s.startRun);
  const isRunning = useStore((s) => s.isRunning);
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] text-slate-400 uppercase tracking-wider">
        Sample scenarios
      </div>
      {SCENARIOS.map((s) => (
        <button
          key={s.id}
          disabled={isRunning}
          onClick={() => startRun(s.payload)}
          className="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-left text-slate-100 transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
          <div className="font-semibold text-sm">{s.label}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{s.subtitle}</div>
        </button>
      ))}
    </div>
  );
}
