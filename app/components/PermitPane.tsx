"use client";
import { useState } from "react";
import type { FamilyReport } from "@/lib/ui/selectors";

export function PermitPane({ report }: { report: FamilyReport }) {
  const permitsWithFiling = report.determinations.filter((d) => d.permit_filing);
  const [activeTab, setActiveTab] = useState(0);

  if (permitsWithFiling.length === 0) {
    return (
      <div className="p-5 bg-slate-800/50 flex flex-col items-center justify-center text-center">
        <div className="text-4xl mb-3">📋</div>
        <div className="text-sm font-semibold text-slate-300 mb-2">
          Permit not yet identified
        </div>
        <div className="text-xs text-slate-400 max-w-xs">
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
    <div className="p-5 bg-slate-800/50 flex flex-col">
      {/* Tabs for multi-permit families */}
      {permitsWithFiling.length > 1 && (
        <div className="flex gap-1 mb-4 border-b border-slate-700 pb-2">
          {permitsWithFiling.map((det, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors border-0 cursor-pointer ${
                activeTab === i
                  ? "bg-sky-900 text-sky-300"
                  : "bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-700"
              }`}
            >
              {det.permit_filing!.form_name}
            </button>
          ))}
        </div>
      )}

      <div className="text-[10px] text-sky-400 uppercase tracking-wider font-semibold mb-2">
        Permit to File
      </div>
      {permitsWithFiling.length === 1 && (
        <div className="text-base font-semibold text-slate-100 mb-1">
          {filing.form_name}
        </div>
      )}
      <div className="text-xs text-slate-400 mb-4">
        {filing.agency}
      </div>

      {/* PDF iframe or portal link */}
      <div className="flex-1 min-h-0 rounded-lg overflow-hidden mb-4">
        {isPdf ? (
          <iframe
            src={filing.form_url}
            className="w-full h-full border-0 rounded-lg bg-white"
            title={filing.form_name}
          />
        ) : (
          <div className="w-full h-full bg-slate-900 rounded-lg flex items-center justify-center text-center p-6">
            <div>
              <div className="text-3xl mb-3">🌐</div>
              <div className="text-sm text-slate-300 mb-1">Online Portal</div>
              <a
                href={filing.form_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sky-400 hover:text-sky-300 break-all"
              >
                {filing.form_url}
              </a>
            </div>
          </div>
        )}
      </div>

      {filing.instructions && (
        <div className="text-xs text-slate-300 mb-3">
          {filing.instructions}
        </div>
      )}

      <a
        href={filing.portal_url}
        target="_blank"
        rel="noreferrer"
        className="block text-center bg-sky-600 hover:bg-sky-500 text-white py-2.5 px-4 rounded-lg text-sm font-semibold no-underline transition-colors"
      >
        Open Filing Portal
      </a>
    </div>
  );
}
