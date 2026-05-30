"use client";
import { useStore } from "@/lib/ui/store";
import { getRepairHistory } from "@/lib/ui/selectors";

export function EvidenceDrawer() {
  const run = useStore((s) => s.run);
  const open = useStore((s) => s.drawerOpen);
  const hypId = useStore((s) => s.selectedHypothesisId);
  const setOpen = useStore((s) => s.setDrawerOpen);
  if (!run || !open || !hypId) return null;
  const bundle = run.evidence_bundles.find((b) => b.hypothesis_id === hypId);
  const verdict = [...run.verification_verdicts].reverse().find((v) => v.hypothesis_id === hypId);
  const history = getRepairHistory(run, hypId);

  return (
    <div
      className="absolute top-0 right-0 bottom-0 bg-slate-900 border-l border-slate-800 p-4 overflow-y-auto z-20 shadow-2xl"
      style={{ width: 420 }}
    >
      <div className="flex justify-between items-center mb-3">
        <div className="font-semibold text-slate-100">Evidence — {hypId}</div>
        <button
          onClick={() => setOpen(false)}
          className="bg-transparent text-slate-400 hover:text-slate-100 border-0 cursor-pointer text-base leading-none transition-colors"
        >
          ×
        </button>
      </div>
      {history.length > 1 && (
        <details
          open
          className="mb-3 p-2 bg-slate-800 border border-slate-700 rounded-md"
        >
          <summary className="cursor-pointer text-xs text-slate-100">
            🔧 Repair history ({history.length} attempts)
          </summary>
          {history.map((h, i) => (
            <div
              key={i}
              className={`mt-2 pt-2 ${i > 0 ? "border-t border-dashed border-slate-700" : ""}`}
            >
              <div
                className={`text-xs ${
                  h.verdict === "pass" ? "text-emerald-500" : "text-red-500"
                }`}
              >
                Attempt {h.attempt} — {h.verdict.toUpperCase()}
              </div>
              {h.failed_check && (
                <div className="text-[11px] text-slate-400">Failed check: {h.failed_check}</div>
              )}
              {h.failure_reason && (
                <div className="text-[11px] text-slate-400">Reason: {h.failure_reason}</div>
              )}
              {h.repair_action && (
                <div className="text-[11px] text-slate-400">Action: {h.repair_action}</div>
              )}
              {h.quote && (
                <blockquote className="my-1 px-2 py-1 border-l-2 border-slate-700 text-[11px] italic text-slate-300">
                  {h.quote}
                </blockquote>
              )}
            </div>
          ))}
        </details>
      )}
      {bundle?.sources.map((s, i) => (
        <div key={i} className="mb-3 p-2 bg-slate-800 rounded-md">
          <div className="text-xs font-semibold text-slate-100">{s.source_name}</div>
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-sky-400 hover:text-sky-300 break-all"
          >
            {s.url}
          </a>
          <blockquote className="my-2 px-2.5 py-1.5 border-l-2 border-sky-400 text-xs italic text-slate-200">
            {s.quote}
          </blockquote>
          <div className="text-[10px] text-slate-500">
            fetched {s.fetched_at} · hash {s.content_hash.slice(0, 12)}
          </div>
        </div>
      ))}
      {verdict && (
        <div className="mt-3">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">
            Verifier checks
          </div>
          {Object.entries(verdict.checks).map(([k, c]) => (
            <div key={k} className="text-[11px] py-0.5 text-slate-100">
              <span className={c.pass ? "text-emerald-500" : "text-red-500"}>
                {c.pass ? "✓" : "✗"}
              </span>{" "}
              {k}: <span className="text-slate-400">{c.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
