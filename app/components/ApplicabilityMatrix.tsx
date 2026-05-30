"use client";
import { useStore } from "@/lib/ui/store";
import type { ResearchRun } from "@/lib/research/types";

export function ApplicabilityMatrix() {
  const run = useStore((s) => s.run);
  const replayDone = useStore((s) => s.replayDone);
  const select = useStore((s) => s.select);
  const filter = useStore((s) => s.matrixFilter);

  if (!run) return <div style={{ padding: 12, color: "var(--text-dim)" }}>No run yet.</div>;
  if (!replayDone) return <div style={{ padding: 12, color: "var(--text-dim)" }}>Matrix builds when replay completes…</div>;

  const rows = run.determinations.filter((d) => {
    if (filter === "all") return true;
    if (filter === "verified") return d.verified;
    if (filter === "needs_review") return d.review_flag;
    if (filter === "failed") return !d.verified && !d.review_flag;
    return true;
  });
  if (rows.length === 0) return <div style={{ padding: 12, color: "var(--text-dim)" }}>No determinations — likely all coverage families blocked. See Missing Facts.</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "var(--panel-2)", textAlign: "left" }}>
            {["Requirement", "Applies", "Trigger", "Fact", "Citation", "Conf", "Verified"].map((h) => (
              <th key={h} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", color: "var(--text-dim)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => {
            const cls = d.verified ? "row-verified" : d.review_flag ? "row-needs-review" : "row-failed";
            const hypId = inferHypIdFromRequirement(d.requirement, run);
            return (
              <tr key={i} className={cls} onClick={() => hypId && select(hypId)} style={{ cursor: hypId ? "pointer" : "default" }}>
                <td style={{ padding: "8px 10px" }}>{d.requirement}</td>
                <td style={{ padding: "8px 10px" }}>{d.applies}</td>
                <td style={{ padding: "8px 10px", color: "var(--text-dim)" }}>{d.trigger}</td>
                <td style={{ padding: "8px 10px", color: "var(--text-dim)" }}>{d.project_fact}</td>
                <td style={{ padding: "8px 10px", color: "var(--text-dim)" }}>{d.citation}</td>
                <td style={{ padding: "8px 10px", fontVariantNumeric: "tabular-nums" }}>{d.confidence.toFixed(2)}</td>
                <td style={{ padding: "8px 10px" }}>{d.verified ? "✓" : d.review_flag ? "⚠" : "✗"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function inferHypIdFromRequirement(req: string, run: ResearchRun): string | null {
  const lower = req.toLowerCase();
  const hit = run.research_graph.find((h) => lower.includes(h.id.toLowerCase()) || h.question.toLowerCase().includes(lower.split(" ")[0] ?? ""));
  return hit?.id ?? null;
}
