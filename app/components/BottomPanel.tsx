"use client";
import { useState } from "react";
import { ApplicabilityMatrix } from "./ApplicabilityMatrix";
import { ReportTab } from "./ReportTab";

export function BottomPanel() {
  const [tab, setTab] = useState<"matrix" | "report">("matrix");
  return (
    <section
      className="border-t border-slate-800 bg-slate-900 flex flex-col overflow-hidden"
      style={{ maxHeight: 320 }}
    >
      <div className="flex border-b border-slate-800">
        {(["matrix", "report"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3.5 py-2 text-xs uppercase tracking-wider text-slate-100 transition-colors border-b-2 ${
              tab === t
                ? "bg-slate-800 border-sky-400"
                : "bg-transparent border-transparent hover:bg-slate-800/60"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        {tab === "matrix" ? <ApplicabilityMatrix /> : <ReportTab />}
      </div>
    </section>
  );
}
