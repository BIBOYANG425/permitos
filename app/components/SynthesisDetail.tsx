"use client";
import type { FamilyReport } from "@/lib/ui/selectors";
import type { ResearchRun } from "@/lib/research/types";
import { getRepairHistory } from "@/lib/ui/selectors";
import { CheckCircle2, XCircle, AlertTriangle, FileSearch, Wrench } from "lucide-react";
import { motion } from "framer-motion";

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function SynthesisDetail({
  familyLabel,
  report,
  run,
}: {
  familyLabel: string;
  report: FamilyReport;
  run: ResearchRun;
}) {
  const verifiedCount = report.determinations.filter((d) => d.verified).length;
  const reviewCount = report.determinations.filter((d) => d.review_flag).length;

  return (
    <div className="overflow-y-auto p-6 border-r border-slate-700/40">
      {/* Header */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="brand-label mb-2">Synthesis Report</div>
        <h2 className="text-xl font-bold text-slate-100">{familyLabel}</h2>
        <div className="flex gap-2 mt-2 text-xs">
          {verifiedCount > 0 && (
            <motion.span
              className="flex items-center gap-1 bg-teal-950/60 text-teal-400 px-2.5 py-1 rounded-full border border-teal-800/30"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              <CheckCircle2 size={11} />
              {verifiedCount} verified
            </motion.span>
          )}
          {reviewCount > 0 && (
            <motion.span
              className="flex items-center gap-1 bg-amber-950/60 text-amber-400 px-2.5 py-1 rounded-full border border-amber-800/30"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.25, duration: 0.3 }}
            >
              <AlertTriangle size={11} />
              {reviewCount} needs review
            </motion.span>
          )}
        </div>
      </motion.div>

      {report.determinations.map((det, i) => {
        const bundle = report.evidenceBundles[i];
        const verdict = report.verdicts[i];
        const hypothesisId = bundle?.hypothesis_id;
        const history = hypothesisId ? getRepairHistory(run, hypothesisId) : [];

        // Count sub-cards for stagger indexing
        let cardIdx = 0;

        return (
          <div key={i} className="mb-6">
            {/* 1. Determination summary */}
            <motion.div
              className="glass rounded-xl p-4 mb-3"
              custom={cardIdx++}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
            >
              <div className="flex items-center gap-1.5 text-[10px] text-cyan-300/70 uppercase tracking-wider font-semibold mb-2.5">
                <FileSearch size={11} />
                Determination
              </div>
              <div className="text-sm font-semibold text-slate-100 mb-2">
                {det.requirement}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div className="text-slate-400">
                  Applies: <span className="text-slate-200 font-medium">{det.applies}</span>
                </div>
                <div className="text-slate-400">
                  Confidence: <span className="text-slate-200 font-mono font-medium">{det.confidence.toFixed(2)}</span>
                </div>
                <div className="text-slate-400 col-span-2">
                  Trigger: <span className="text-slate-300">{det.trigger}</span>
                </div>
                <div className="text-slate-400 col-span-2">
                  Fact: <span className="text-slate-300">{det.project_fact}</span>
                </div>
              </div>
            </motion.div>

            {/* 2. Source evidence */}
            {bundle?.sources.map((source, si) => (
              <motion.div
                key={si}
                className="glass rounded-xl p-4 mb-3"
                custom={cardIdx++}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
              >
                <div className="text-[10px] text-cyan-300/70 uppercase tracking-wider font-semibold mb-2.5">
                  Source Evidence
                </div>
                <div className="text-xs font-semibold text-slate-100">
                  {source.source_name}
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-cyan-300 hover:text-cyan-200 break-all transition-colors"
                >
                  {source.url}
                </a>
                <blockquote className="my-2.5 px-3 py-2 border-l-2 border-cyan-400/50 text-xs italic text-slate-200 bg-slate-800/30 rounded-r-lg">
                  {source.quote}
                </blockquote>
                <div className="text-[10px] text-slate-500 font-mono">
                  fetched {source.fetched_at.slice(0, 10)} · hash{" "}
                  {source.content_hash.slice(0, 12)}
                </div>
              </motion.div>
            ))}

            {/* 3. Verifier checks */}
            {verdict && (
              <motion.div
                className="glass rounded-xl p-4 mb-3"
                custom={cardIdx++}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
              >
                <div className="text-[10px] text-cyan-300/70 uppercase tracking-wider font-semibold mb-2.5">
                  Verifier Checks
                </div>
                <div className="space-y-1">
                  {Object.entries(verdict.checks).map(([checkName, check]) => (
                    <div key={checkName} className="flex items-start gap-2 text-[11px] py-0.5">
                      {check.pass ? (
                        <CheckCircle2 size={13} className="text-teal-400 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <span className="text-slate-200 font-medium">{checkName}</span>
                        <span className="text-slate-500 mx-1">·</span>
                        <span className="text-slate-400">{check.reason}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* 4. Repair history */}
            {history.length > 1 && (
              <motion.div
                className="glass rounded-xl p-4 mb-3"
                custom={cardIdx++}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
              >
                <div className="flex items-center gap-1.5 text-[10px] text-cyan-300/70 uppercase tracking-wider font-semibold mb-2.5">
                  <Wrench size={11} />
                  Repair History · {history.length} attempts
                </div>
                {history.map((h, hi) => (
                  <div
                    key={hi}
                    className={`${hi > 0 ? "mt-3 pt-3 border-t border-dashed border-slate-700/50" : ""}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {h.verdict === "pass" ? (
                        <CheckCircle2 size={12} className="text-teal-400" />
                      ) : (
                        <XCircle size={12} className="text-red-400" />
                      )}
                      <span
                        className={`text-xs font-semibold ${
                          h.verdict === "pass" ? "text-teal-400" : "text-red-400"
                        }`}
                      >
                        Attempt {h.attempt} — {h.verdict.toUpperCase()}
                        {h.failed_check ? ` (${h.failed_check})` : ""}
                      </span>
                    </div>
                    {h.failure_reason && (
                      <div className="text-[11px] text-slate-400 mt-1 ml-5">
                        Reason: {h.failure_reason}
                      </div>
                    )}
                    {h.repair_action && (
                      <div className="text-[11px] text-slate-400 ml-5">
                        Action: {h.repair_action}
                      </div>
                    )}
                    {h.quote && (
                      <blockquote className="my-1.5 ml-5 px-2.5 py-1.5 border-l-2 border-slate-700/50 text-[11px] italic text-slate-300 bg-slate-800/30 rounded-r">
                        {h.quote}
                      </blockquote>
                    )}
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        );
      })}
    </div>
  );
}
