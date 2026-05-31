"use client";
import { useState } from "react";
import type { FamilyReport } from "@/lib/ui/selectors";
import { FileText, Globe, ClipboardList, ExternalLink } from "lucide-react";

export function PermitPane({ report }: { report: FamilyReport }) {
  const permitsWithFiling = report.determinations.filter((d) => d.permit_filing);
  const [activeTab, setActiveTab] = useState(0);

  if (permitsWithFiling.length === 0) {
    return (
      <div className="p-6 bg-slate-800/30 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-4 border border-slate-700/30">
          <ClipboardList size={24} className="text-slate-500" />
        </div>
        <div className="text-sm font-semibold text-slate-300 mb-2">
          Permit not yet identified
        </div>
        <div className="text-xs text-slate-500 max-w-xs leading-relaxed">
          Resolve missing facts or review evidence to determine filing requirements.
        </div>
      </div>
    );
  }

  const activeDet = permitsWithFiling[activeTab];
  const filing = activeDet?.permit_filing;
  if (!filing) return null;

  const isPdf = filing.form_url.endsWith(".pdf");

  return (
    <div className="p-6 bg-slate-800/30 flex flex-col">
      {/* Tabs for multi-permit families */}
      {permitsWithFiling.length > 1 && (
        <div className="flex gap-1 mb-5 border-b border-slate-700/40 pb-2.5">
          {permitsWithFiling.map((det, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 border cursor-pointer ${
                activeTab === i
                  ? "bg-cyan-900/40 text-cyan-300 border-cyan-700/40"
                  : "bg-transparent text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-700/50"
              }`}
            >
              {det.permit_filing!.form_name}
            </button>
          ))}
        </div>
      )}

      <div className="brand-label mb-3">Permit to File</div>
      {permitsWithFiling.length === 1 && (
        <div className="text-base font-semibold text-slate-100 mb-1">
          {filing.form_name}
        </div>
      )}
      <div className="text-xs text-slate-400 mb-5">
        {filing.agency}
      </div>

      {/* PDF iframe or portal link */}
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden mb-5 border border-slate-700/30">
        {isPdf ? (
          <iframe
            src={filing.form_url}
            className="w-full h-full border-0 rounded-xl bg-white"
            title={filing.form_name}
          />
        ) : (
          <div className="w-full h-full bg-slate-900/60 rounded-xl flex items-center justify-center text-center p-8">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-4 mx-auto border border-slate-700/30">
                <Globe size={24} className="text-cyan-300/60" />
              </div>
              <div className="text-sm text-slate-300 font-medium mb-2">Online Portal</div>
              <a
                href={filing.form_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-cyan-300 hover:text-cyan-200 break-all transition-colors"
              >
                {filing.form_url}
              </a>
            </div>
          </div>
        )}
      </div>

      {filing.instructions && (
        <div className="flex items-start gap-2 text-xs text-slate-300 mb-4 p-3 rounded-lg bg-slate-800/40 border border-slate-700/20">
          <FileText size={13} className="text-slate-500 mt-0.5 shrink-0" />
          {filing.instructions}
        </div>
      )}

      <a
        href={filing.portal_url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white py-2.5 px-4 rounded-xl text-sm font-semibold no-underline transition-all duration-200 hover:shadow-glow"
      >
        Open Filing Portal
        <ExternalLink size={14} />
      </a>
    </div>
  );
}
