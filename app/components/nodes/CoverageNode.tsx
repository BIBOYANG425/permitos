"use client";
import { Handle, Position } from "reactflow";

export function CoverageNode({ data }: { data: { label: string; status: string } }) {
  return (
    <div className="node" data-status={data.status} style={{ fontWeight: 600 }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>COVERAGE</div>
      <div>{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
