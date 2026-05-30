"use client";
import { SCENARIOS } from "@/lib/ui/scenarios";
import { useStore } from "@/lib/ui/store";

export function ScenarioButtons() {
  const startRun = useStore((s) => s.startRun);
  const isRunning = useStore((s) => s.isRunning);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>Sample scenarios</div>
      {SCENARIOS.map((s) => (
        <button
          key={s.id}
          disabled={isRunning}
          onClick={() => startRun(s.payload)}
          style={{
            padding: "10px 12px",
            background: "var(--panel-2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            textAlign: "left",
            cursor: isRunning ? "wait" : "pointer",
          }}
        >
          <div style={{ fontWeight: 600 }}>{s.label}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{s.subtitle}</div>
        </button>
      ))}
    </div>
  );
}
