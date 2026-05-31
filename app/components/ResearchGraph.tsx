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
import { Network } from "lucide-react";
import { motion } from "framer-motion";

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
      <motion.div
        className="flex flex-col items-center justify-center h-full gap-4 text-center px-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center">
          <Network size={28} className="text-cyan-300/40" />
        </div>
        <div>
          <div className="text-sm text-slate-400 mb-1">No active research</div>
          <div className="text-xs text-slate-500">Pick a sample scenario or describe a project on the left.</div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      style={{ position: "relative", width: "100%", height: "100%" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
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
        <Background gap={20} color="rgba(103, 232, 249, 0.04)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </motion.div>
  );
}
