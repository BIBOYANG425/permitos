"use client";
import { useStore } from "@/lib/ui/store";

export function Header() {
  const run = useStore((s) => s.run);
  const reset = useStore((s) => s.reset);
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--panel)" }}>
      <div style={{ fontWeight: 600 }}>PermitPilot · Truth Engine</div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12, color: "var(--text-dim)" }}>
        {run && <span>run: <code>{run.run_id}</code></span>}
        {run && <span>status: <b style={{ color: run.status === "done" ? "var(--green)" : "var(--yellow)" }}>{run.status}</b></span>}
        <button onClick={reset} style={{ padding: "4px 10px", background: "transparent", color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>Reset</button>
      </div>
    </header>
  );
}
