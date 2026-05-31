"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/ui/store";
import { groupDeterminationsByFamily } from "@/lib/ui/selectors";
import { SynthesisDetail } from "./SynthesisDetail";
import { PermitPane } from "./PermitPane";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

  const grouped = run && reportFamily ? groupDeterminationsByFamily(run) : null;
  const familyReport = grouped?.get(reportFamily!);

  return (
    <AnimatePresence>
      {run && reportFamily && familyReport && (
        <motion.div
          data-testid="overlay-backdrop"
          className="fixed inset-0 z-50 flex items-start justify-center"
          style={{ background: "rgba(5, 7, 11, 0.92)", backdropFilter: "blur(8px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeReport();
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="relative glass rounded-2xl overflow-hidden grid grid-cols-2 shadow-card"
            style={{ maxWidth: 1400, width: "95vw", height: "calc(100vh - 48px)", marginTop: 24 }}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            <button
              onClick={closeReport}
              aria-label="Close overlay"
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800/80 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors border border-slate-700/40 cursor-pointer"
            >
              <X size={16} />
            </button>
            <SynthesisDetail
              familyLabel={FAMILY_LABELS[reportFamily]}
              report={familyReport}
              run={run}
            />
            <PermitPane report={familyReport} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
