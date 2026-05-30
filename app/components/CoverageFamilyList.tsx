"use client";
import { useStore } from "@/lib/ui/store";

const COLORS: Record<string, string> = {
  active: "var(--green)",
  blocked_missing_fact: "var(--yellow)",
  out_of_scope: "var(--text-dim)",
  discovery_candidate: "var(--accent)",
};

export function CoverageFamilyList() {
  const run = useStore((s) => s.run);
  if (!run) return null;
  return (
    <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8 }}>Coverage families</div>
      {run.coverage_family_statuses.map((c) => (
        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
          <span>{c.family}</span>
          <span style={{ color: COLORS[c.status] ?? "var(--text-dim)", fontSize: 11 }}>{c.status.replace(/_/g, " ")}</span>
        </div>
      ))}
    </div>
  );
}
