"use client";
import { useStore } from "@/lib/ui/store";

const COLORS: Record<string, string> = {
  active: "text-emerald-500",
  blocked_missing_fact: "text-amber-500",
  out_of_scope: "text-slate-500",
  discovery_candidate: "text-sky-400",
};

export function CoverageFamilyList() {
  const run = useStore((s) => s.run);
  if (!run) return null;
  return (
    <div className="p-3 border-b border-slate-800">
      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-2">
        Coverage families
      </div>
      {run.coverage_family_statuses.map((c) => (
        <div key={c.id} className="flex justify-between py-1 text-xs text-slate-100">
          <span>{c.family}</span>
          <span className={`text-[11px] ${COLORS[c.status] ?? "text-slate-400"}`}>
            {c.status.replace(/_/g, " ")}
          </span>
        </div>
      ))}
    </div>
  );
}
