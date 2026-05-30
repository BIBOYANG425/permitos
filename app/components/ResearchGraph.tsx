"use client";
import { useMemo } from "react";
import ReactFlow, { Background, Controls, type NodeTypes } from "reactflow";
import "reactflow/dist/style.css";
import { useStore } from "@/lib/ui/store";
import { buildGraph } from "@/lib/ui/graphLayout";
import { CoverageNode } from "./nodes/CoverageNode";
import { AngleNode } from "./nodes/AngleNode";
import { HypothesisNode } from "./nodes/HypothesisNode";
import { TaskNode } from "./nodes/TaskNode";
import { ReplayControls } from "./ReplayControls";

const nodeTypes: NodeTypes = {
  coverage: CoverageNode,
  angle: AngleNode,
  hypothesis: HypothesisNode,
  task: TaskNode,
};

export function ResearchGraph() {
  const run = useStore((s) => s.run);
  const replayedIds = useStore((s) => s.replayedEventIds);
  const select = useStore((s) => s.select);

  const { nodes, edges } = useMemo(() => {
    if (!run) return { nodes: [], edges: [] };
    return buildGraph(run, replayedIds);
  }, [run, replayedIds]);

  if (!run) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-dim)", padding: 20, textAlign: "center" }}>
        Pick a sample scenario or describe a project on the left.
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ReplayControls />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => {
          const hypId = (node.data as { hypothesisId?: string }).hypothesisId;
          if (hypId) select(hypId);
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background gap={20} color="#1f2330" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
