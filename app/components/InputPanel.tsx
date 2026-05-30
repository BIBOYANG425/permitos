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
    <aside style={{ width: 320, padding: 16, borderRight: "1px solid var(--border)", background: "var(--panel)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <ScenarioButtons />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>Or describe a project</div>
        <textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe your project change…"
          style={{ width: "100%", padding: 10, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, resize: "vertical", fontFamily: "inherit", fontSize: 12 }}
        />
        <button
          disabled={isRunning || !text.trim()}
          onClick={() => startRun({ project_description: text, demo_documents: [] })}
          style={{ padding: "8px 14px", background: "var(--accent)", color: "white", border: 0, borderRadius: 8, cursor: isRunning ? "wait" : "pointer", fontWeight: 600 }}
        >
          {isRunning ? "Running…" : "Run"}
        </button>
      </div>
      {error && <div style={{ padding: 10, background: "rgba(239,90,111,0.12)", border: "1px solid var(--red)", borderRadius: 8, fontSize: 12, color: "var(--red)" }}>{error}</div>}
      <JurisdictionStack />
      <MissingFactsCard />
    </aside>
  );
}
