"use client";
import { useState } from "react";
import { ScenarioButtons } from "./ScenarioButtons";
import { MissingFactsCard } from "./MissingFactsCard";
import { JurisdictionStack } from "./JurisdictionStack";
import { useStore } from "@/lib/ui/store";

export function InputPanel() {
  const [text, setText] = useState("");
  const startRun = useStore((s) => s.startRun);
  const isRunning = useStore((s) => s.isRunning);
  const error = useStore((s) => s.runError);
  return (
    <aside className="w-80 p-4 border-r border-slate-800 bg-slate-900 overflow-y-auto flex flex-col gap-3.5">
      <ScenarioButtons />
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] text-slate-400 uppercase tracking-wider">
          Or describe a project
        </div>
        <textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe your project change…"
          className="w-full p-2.5 bg-slate-950 text-slate-100 border border-slate-700 rounded-lg resize-y text-xs placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
        />
        <button
          disabled={isRunning || !text.trim()}
          onClick={() => startRun({ project_description: text, demo_documents: [] })}
          className="px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-white border-0 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
          {isRunning ? "Running…" : "Run"}
        </button>
      </div>
      {error && (
        <div className="p-2.5 bg-red-500/10 border border-red-500 rounded-lg text-xs text-red-400">
          {error}
        </div>
      )}
      <JurisdictionStack />
      <MissingFactsCard />
    </aside>
  );
}
