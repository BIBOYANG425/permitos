import dagre from "dagre";
import type { ResearchRun } from "@/lib/research/types";
import { isCoverageVisible, isHypothesisVisible, getHypothesisState } from "./selectors";

export type FlowNode = {
  id: string;
  type: "coverage" | "angle" | "hypothesis" | "task";
  position: { x: number; y: number };
  data: {
    label: string;
    status: string;
    family?: string;
    hypothesisId?: string;
  };
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
};

const NODE_W = 180;
const NODE_H = 60;

export function buildGraph(run: ResearchRun, replayedIds: Set<string>): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  const coverageVisible = isCoverageVisible(run, replayedIds);
  const hypothesesVisible = isHypothesisVisible(run, "*", replayedIds);

  if (!coverageVisible) return { nodes: [], edges: [] };

  const coverageByFamily = new Map<string, string>();
  for (const cov of run.coverage_family_statuses) {
    if (cov.status === "out_of_scope") continue;
    coverageByFamily.set(cov.family, cov.id);
    nodes.push({
      id: cov.id,
      type: "coverage",
      position: { x: 0, y: 0 },
      data: {
        label: prettyFamily(cov.family),
        status: cov.status === "blocked_missing_fact" ? "blocked" : "verified",
        family: cov.family,
      },
    });
  }

  if (hypothesesVisible) {
    for (const angle of run.regulatory_angles) {
      nodes.push({
        id: angle.id,
        type: "angle",
        position: { x: 0, y: 0 },
        data: { label: angle.label, status: "verified", family: angle.family },
      });
      const covId = coverageByFamily.get(angle.family);
      if (covId) {
        edges.push({ id: `e_${covId}_${angle.id}`, source: covId, target: angle.id });
      }
    }
    for (const hyp of run.research_graph) {
      const state = getHypothesisState(run, hyp.id, replayedIds);
      nodes.push({
        id: hyp.id,
        type: "hypothesis",
        position: { x: 0, y: 0 },
        data: { label: truncate(hyp.question, 60), status: state, family: hyp.family, hypothesisId: hyp.id },
      });
      edges.push({ id: `e_${hyp.angle_id}_${hyp.id}`, source: hyp.angle_id, target: hyp.id });
    }
    for (const task of run.research_tasks) {
      nodes.push({
        id: task.task_id,
        type: "task",
        position: { x: 0, y: 0 },
        data: { label: task.assigned_agent, status: "verified", hypothesisId: task.hypothesis_id },
      });
      edges.push({ id: `e_${task.hypothesis_id}_${task.task_id}`, source: task.hypothesis_id, target: task.task_id });
    }
  }

  layout(nodes, edges);
  return { nodes, edges };
}

function layout(nodes: FlowNode[], edges: FlowEdge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) g.setEdge(e.source, e.target);
  }
  dagre.layout(g);
  for (const n of nodes) {
    const pos = g.node(n.id);
    if (pos) n.position = { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 };
  }
}

function prettyFamily(f: string) {
  return f.toUpperCase().replace(/_/g, " ");
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
