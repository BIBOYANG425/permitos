"use client";
import { useState } from "react";
import { ScenarioButtons } from "./ScenarioButtons";
import { MissingFactsCard } from "./MissingFactsCard";
import { JurisdictionStack } from "./JurisdictionStack";
import { useStore } from "@/lib/ui/store";
import { Play, Loader2 } from "lucide-react";

export function InputPanel() {
  const [text, setText] = useState("");
  const startRun = useStore((s) => s.startRun);
  const isRunning = useStore((s) => s.isRunning);
  const error = useStore((s) => s.runError);
  return (
    <aside className="w-80 p-4 border-r border-slate-800/60 bg-slate-900/80 backdrop-blur-sm overflow-y-auto flex flex-col gap-3.5">
      <ScenarioButtons />
      <div className="flex flex-col gap-1.5">
        <div className="brand-label">
          Or describe a project
        </div>
        <textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe your project change…"
          className="w-full p-2.5 bg-slate-950/60 text-slate-100 border border-slate-700/40 rounded-xl resize-y text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-600/50 transition-colors"
        />
        <button
          disabled={isRunning || !text.trim()}
          onClick={() => startRun({ project_description: text, demo_documents: [] })}
          className="flex items-center justify-center gap-2 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white border-0 rounded-xl font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-wait hover:shadow-glow cursor-pointer"
        >
          {isRunning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play size={14} />
              Run
            </>
          )}
        </button>
      </div>
      {error && (
        <div className="p-2.5 bg-red-500/10 border border-red-800/30 rounded-xl text-xs text-red-400">
          {error}
        </div>
      )}
      <JurisdictionStack />
      <MissingFactsCard />
    </aside>
  );
}
