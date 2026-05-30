"use client";
import { Handle, Position } from "reactflow";

const ICONS: Record<string, string> = {
  pending: "·", running: "↻", verified: "✓", failed: "✗", repairing: "🔧", blocked: "🔒",
};

export function HypothesisNode({ data }: { data: { label: string; status: string } }) {
  return (
    <div className="node" data-status={data.status}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>HYPOTHESIS {ICONS[data.status] ?? ""}</div>
      <div style={{ fontSize: 11 }}>{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
