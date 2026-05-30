"use client";
import { useStore } from "@/lib/ui/store";

export function MissingFactsCard() {
  const run = useStore((s) => s.run);
  const missing = run?.scope_pack?.missing_facts ?? [];
  if (missing.length === 0) return null;
  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8 }}>Missing facts ({missing.length})</div>
      {missing.map((m) => (
        <div key={m.field} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "var(--yellow)" }}>⚠ {m.field}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{m.why_needed}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Blocks: {m.blocks.join(", ")}</div>
          <input disabled placeholder="Provide value (v2)" title="v2 feature" style={{ marginTop: 4, width: "100%", padding: "4px 6px", background: "var(--bg)", color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}
