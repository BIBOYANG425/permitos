"use client";
import { Handle, Position } from "reactflow";

export function TaskNode({ data }: { data: { label: string; status: string } }) {
  return (
    <div className="node" data-status={data.status} style={{ minWidth: 100, padding: "6px 10px" }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>TASK</div>
      <div style={{ fontSize: 11 }}>{data.label}</div>
    </div>
  );
}
