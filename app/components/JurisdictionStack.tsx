"use client";
import { useStore } from "@/lib/ui/store";

export function JurisdictionStack() {
  const stack = useStore((s) => s.run?.jurisdiction_stack ?? []);
  if (stack.length === 0) return null;
  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8 }}>Jurisdiction stack</div>
      {stack.map((j) => (
        <div key={j} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px dashed var(--border)" }}>{j}</div>
      ))}
    </div>
  );
}
