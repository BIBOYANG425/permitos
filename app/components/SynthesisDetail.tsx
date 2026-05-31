"use client";
import type { FamilyReport } from "@/lib/ui/selectors";
import type { ResearchRun } from "@/lib/research/types";
import { getRepairHistory } from "@/lib/ui/selectors";

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
    <div className="overflow-y-auto p-5 border-r border-slate-700">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-100">{familyLabel}</h2>
        <div className="flex gap-2 mt-1 text-xs">
          {verifiedCount > 0 && (
            <span className="bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded-full">
              {verifiedCount} verified
            </span>
          )}
          {reviewCount > 0 && (
            <span className="bg-amber-950 text-amber-400 px-2 py-0.5 rounded-full">
              {reviewCount} needs_review
            </span>
          )}
        </div>
      </div>

      {report.determinations.map((det, i) => {
        const bundle = report.evidenceBundles[i];
        const verdict = report.verdicts[i];
        const hypothesisId = bundle?.hypothesis_id;
        const history = hypothesisId ? getRepairHistory(run, hypothesisId) : [];

        return (
          <div key={i} className="mb-5">
            {/* 1. Determination summary */}
            <div className="bg-slate-800 rounded-lg p-3 mb-2">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                Determination
              </div>
              <div className="text-sm font-semibold text-slate-100 mb-1">
                {det.requirement}
              </div>
              <div className="text-xs text-slate-300">
                <strong>Applies:</strong> {det.applies}
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                <strong>Trigger:</strong> {det.trigger}
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                <strong>Project fact:</strong> {det.project_fact}
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                <strong>Confidence:</strong> {det.confidence.toFixed(2)}
              </div>
            </div>

            {/* 2. Source evidence */}
            {bundle?.sources.map((source, si) => (
              <div key={si} className="bg-slate-800 rounded-lg p-3 mb-2">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                  Source Evidence
                </div>
                <div className="text-xs font-semibold text-slate-100">
                  {source.source_name}
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-sky-400 hover:text-sky-300 break-all"
                >
                  {source.url}
                </a>
                <blockquote className="my-2 px-2.5 py-1.5 border-l-2 border-sky-400 text-xs italic text-slate-200">
                  {source.quote}
                </blockquote>
                <div className="text-[10px] text-slate-500">
                  fetched {source.fetched_at.slice(0, 10)} · hash{" "}
                  {source.content_hash.slice(0, 12)}
                </div>
              </div>
            ))}

            {/* 3. Verifier checks */}
            {verdict && (
              <div className="bg-slate-800 rounded-lg p-3 mb-2">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                  Verifier Checks
                </div>
                {Object.entries(verdict.checks).map(([checkName, check]) => (
                  <div key={checkName} className="text-[11px] py-0.5 text-slate-100">
                    <span className={check.pass ? "text-emerald-500" : "text-red-500"}>
                      {check.pass ? "✓" : "✗"}
                    </span>{" "}
                    {checkName}:{" "}
                    <span className="text-slate-400">{check.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 4. Repair history */}
            {history.length > 1 && (
              <div className="bg-slate-800 rounded-lg p-3 mb-2">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                  Repair history ({history.length} attempts)
                </div>
                {history.map((h, hi) => (
                  <div
                    key={hi}
                    className={`${hi > 0 ? "mt-2 pt-2 border-t border-dashed border-slate-700" : ""}`}
                  >
                    <div
                      className={`text-xs ${
                        h.verdict === "pass" ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      Attempt {h.attempt} — {h.verdict.toUpperCase()}
                      {h.failed_check ? ` (${h.failed_check})` : ""}
                    </div>
                    {h.failure_reason && (
                      <div className="text-[11px] text-slate-400">
                        Reason: {h.failure_reason}
                      </div>
                    )}
                    {h.repair_action && (
                      <div className="text-[11px] text-slate-400">
                        Action: {h.repair_action}
                      </div>
                    )}
                    {h.quote && (
                      <blockquote className="my-1 px-2 py-1 border-l-2 border-slate-700 text-[11px] italic text-slate-300">
                        {h.quote}
                      </blockquote>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
