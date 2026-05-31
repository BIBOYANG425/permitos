"use client";
import { useStore } from "@/lib/ui/store";
import { getRepairHistory } from "@/lib/ui/selectors";
import { X, CheckCircle2, XCircle, Wrench } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function EvidenceDrawer() {
  const run = useStore((s) => s.run);
  const open = useStore((s) => s.drawerOpen);
  const hypId = useStore((s) => s.selectedHypothesisId);
  const setOpen = useStore((s) => s.setDrawerOpen);

  const bundle = run && hypId ? run.evidence_bundles.find((b) => b.hypothesis_id === hypId) : null;
  const verdict = run && hypId ? [...run.verification_verdicts].reverse().find((v) => v.hypothesis_id === hypId) : null;
  const history = run && hypId ? getRepairHistory(run, hypId) : [];

  return (
    <AnimatePresence>
      {run && open && hypId && (
        <motion.div
          className="absolute top-0 right-0 bottom-0 z-20 overflow-y-auto p-5"
          style={{
            width: 420,
            background: "rgba(15, 23, 42, 0.92)",
            backdropFilter: "blur(16px)",
            borderLeft: "1px solid rgba(148, 163, 184, 0.22)",
            boxShadow: "0 0 60px rgba(0,0,0,0.5)",
          }}
          initial={{ x: 420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 420, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="brand-label mb-1">Evidence</div>
              <div className="text-sm font-semibold text-slate-100 font-mono">{hypId}</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800/60 text-slate-400 hover:text-slate-100 hover:bg-slate-700 border border-slate-700/30 cursor-pointer transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Repair history */}
          {history.length > 1 && (
            <motion.details
              open
              className="mb-4 glass rounded-xl overflow-hidden"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              <summary className="cursor-pointer text-xs text-slate-100 p-3 flex items-center gap-1.5 font-medium">
                <Wrench size={12} className="text-orange-400" />
                Repair history ({history.length} attempts)
              </summary>
              <div className="px-3 pb-3">
                {history.map((h, i) => (
                  <div
                    key={i}
                    className={`mt-2 pt-2 ${i > 0 ? "border-t border-dashed border-slate-700/40" : ""}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {h.verdict === "pass" ? (
                        <CheckCircle2 size={12} className="text-teal-400" />
                      ) : (
                        <XCircle size={12} className="text-red-400" />
                      )}
                      <span className={`text-xs font-semibold ${h.verdict === "pass" ? "text-teal-400" : "text-red-400"}`}>
                        Attempt {h.attempt} — {h.verdict.toUpperCase()}
                      </span>
                    </div>
                    {h.failed_check && (
                      <div className="text-[11px] text-slate-400 ml-5 mt-0.5">Check: {h.failed_check}</div>
                    )}
                    {h.failure_reason && (
                      <div className="text-[11px] text-slate-400 ml-5">Reason: {h.failure_reason}</div>
                    )}
                    {h.repair_action && (
                      <div className="text-[11px] text-slate-400 ml-5">Action: {h.repair_action}</div>
                    )}
                    {h.quote && (
                      <blockquote className="my-1.5 ml-5 px-2.5 py-1.5 border-l-2 border-slate-700/50 text-[11px] italic text-slate-300 bg-slate-800/30 rounded-r">
                        {h.quote}
                      </blockquote>
                    )}
                  </div>
                ))}
              </div>
            </motion.details>
          )}

          {/* Source evidence */}
          {bundle?.sources.map((s, i) => (
            <motion.div
              key={i}
              className="mb-3 glass rounded-xl p-3.5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.3 }}
            >
              <div className="text-xs font-semibold text-slate-100">{s.source_name}</div>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-cyan-300 hover:text-cyan-200 break-all transition-colors"
              >
                {s.url}
              </a>
              <blockquote className="my-2.5 px-3 py-2 border-l-2 border-cyan-400/50 text-xs italic text-slate-200 bg-slate-800/30 rounded-r-lg">
                {s.quote}
              </blockquote>
              <div className="text-[10px] text-slate-500 font-mono">
                fetched {s.fetched_at} · hash {s.content_hash.slice(0, 12)}
              </div>
            </motion.div>
          ))}

          {/* Verifier checks */}
          {verdict && (
            <motion.div
              className="mt-3 glass rounded-xl p-3.5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              <div className="text-[10px] text-cyan-300/70 uppercase tracking-wider font-semibold mb-2">
                Verifier checks
              </div>
              <div className="space-y-1">
                {Object.entries(verdict.checks).map(([k, c]) => (
                  <div key={k} className="flex items-start gap-2 text-[11px] py-0.5">
                    {c.pass ? (
                      <CheckCircle2 size={13} className="text-teal-400 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <span className="text-slate-200 font-medium">{k}</span>
                      <span className="text-slate-500 mx-1">·</span>
                      <span className="text-slate-400">{c.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
