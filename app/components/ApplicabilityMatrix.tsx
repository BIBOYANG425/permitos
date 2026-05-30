"use client";
import { useStore } from "@/lib/ui/store";
import { hypothesisIdForDeterminationIndex } from "@/lib/ui/selectors";

export function ApplicabilityMatrix() {
  const run = useStore((s) => s.run);
  const replayDone = useStore((s) => s.replayDone);
  const select = useStore((s) => s.select);
  const filter = useStore((s) => s.matrixFilter);

  if (!run) return <div className="p-3 text-slate-400 text-xs">No run yet.</div>;
  if (!replayDone)
    return (
      <div className="p-3 text-slate-400 text-xs">Matrix builds when replay completes…</div>
    );

  // Capture original index BEFORE filtering so hypothesisIdForDeterminationIndex
  // resolves to the correct research_graph entry (filter changes positional index).
  const rows = run.determinations
    .map((d, originalIndex) => ({ d, originalIndex }))
    .filter(({ d }) => {
      if (filter === "all") return true;
      if (filter === "verified") return d.verified;
      if (filter === "needs_review") return d.review_flag;
      if (filter === "failed") return !d.verified && !d.review_flag;
      return true;
    });
  if (rows.length === 0)
    return (
      <div className="p-3 text-slate-400 text-xs">
        No determinations — likely all coverage families blocked. See Missing Facts.
      </div>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-800 text-left">
            {["Requirement", "Applies", "Trigger", "Fact", "Citation", "Conf", "Verified"].map(
              (h) => (
                <th
                  key={h}
                  className="px-2.5 py-2 border-b border-slate-700 text-slate-400 font-medium text-[11px] uppercase tracking-wider"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map(({ d, originalIndex }) => {
            const tone = d.verified
              ? "bg-emerald-950/30 hover:bg-emerald-900/40"
              : d.review_flag
              ? "bg-amber-950/30 hover:bg-amber-900/40"
              : "bg-red-950/30 hover:bg-red-900/40";
            const hypId = hypothesisIdForDeterminationIndex(run, originalIndex);
            return (
              <tr
                key={originalIndex}
                className={`${tone} transition-colors ${
                  hypId ? "cursor-pointer" : "cursor-default"
                }`}
                onClick={() => hypId && select(hypId)}
              >
                <td className="px-2.5 py-2 text-slate-100">{d.requirement}</td>
                <td className="px-2.5 py-2 text-slate-100">{d.applies}</td>
                <td className="px-2.5 py-2 text-slate-400">{d.trigger}</td>
                <td className="px-2.5 py-2 text-slate-400">{d.project_fact}</td>
                <td className="px-2.5 py-2 text-slate-400">{d.citation}</td>
                <td className="px-2.5 py-2 tabular-nums text-slate-100">
                  {d.confidence.toFixed(2)}
                </td>
                <td className="px-2.5 py-2 text-slate-100">
                  {d.verified ? (
                    <span className="text-emerald-500">✓</span>
                  ) : d.review_flag ? (
                    <span className="text-amber-500">⚠</span>
                  ) : (
                    <span className="text-red-500">✗</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

