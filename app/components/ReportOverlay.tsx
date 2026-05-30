"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/ui/store";
import { groupDeterminationsByFamily } from "@/lib/ui/selectors";
import { SynthesisDetail } from "./SynthesisDetail";
import { PermitPane } from "./PermitPane";
import type { CoverageFamily } from "@/lib/research/types";

const FAMILY_LABELS: Record<CoverageFamily, string> = {
  air: "Air Quality",
  stormwater: "Stormwater",
  hazmat: "Hazmat",
  waste: "Haz Waste",
  wastewater: "Wastewater",
  land_use: "Land Use",
  fire_code: "Fire Code",
  ceqa: "CEQA",
  osha: "OSHA",
};

export function ReportOverlay() {
  const run = useStore((s) => s.run);
  const reportFamily = useStore((s) => s.reportFamily);
  const closeReport = useStore((s) => s.closeReport);

  useEffect(() => {
    if (!reportFamily) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeReport();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [reportFamily, closeReport]);

  if (!run || !reportFamily) return null;

  const grouped = groupDeterminationsByFamily(run);
  const familyReport = grouped.get(reportFamily);
  if (!familyReport) return null;

  return (
    <div
      data-testid="overlay-backdrop"
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ background: "rgba(2, 6, 23, 0.92)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeReport();
      }}
    >
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-xl overflow-hidden grid grid-cols-2"
        style={{ maxWidth: 1400, width: "95vw", height: "calc(100vh - 48px)", marginTop: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={closeReport}
          aria-label="Close overlay"
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-md bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors border-0 cursor-pointer text-lg leading-none"
        >
          ✕
        </button>
        <SynthesisDetail
          familyLabel={FAMILY_LABELS[reportFamily]}
          report={familyReport}
          run={run}
        />
        <PermitPane report={familyReport} />
      </div>
    </div>
  );
}
