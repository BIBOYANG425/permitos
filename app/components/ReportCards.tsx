"use client";
import { useStore } from "@/lib/ui/store";
import { groupDeterminationsByFamily } from "@/lib/ui/selectors";
import type { CoverageFamily } from "@/lib/research/types";
import { Shield, Droplets, FlaskConical, Trash2, Waves } from "lucide-react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

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

const FAMILY_ICONS: Partial<Record<CoverageFamily, LucideIcon>> = {
  air: Shield,
  stormwater: Droplets,
  hazmat: FlaskConical,
  waste: Trash2,
  wastewater: Waves,
};

const FAMILY_ORDER: CoverageFamily[] = ["air", "stormwater", "hazmat", "waste", "wastewater"];

export function ReportCards() {
  const run = useStore((s) => s.run);
  const replayDone = useStore((s) => s.replayDone);
  const openReport = useStore((s) => s.openReport);

  if (!run || !replayDone) return null;

  const grouped = groupDeterminationsByFamily(run);
  const familyStatusMap = new Map(run.coverage_family_statuses.map((s) => [s.family, s]));

  return (
    <motion.section
      className="border-t border-slate-800/60 bg-slate-900/60 backdrop-blur-sm p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="grid grid-cols-5 gap-3">
        {FAMILY_ORDER.map((family, i) => {
          const report = grouped.get(family);
          const status = familyStatusMap.get(family);
          const isOutOfScope = status?.status === "out_of_scope";
          const determinations = report?.determinations ?? [];
          const verifiedCount = determinations.filter((d) => d.verified).length;
          const reviewCount = determinations.filter((d) => d.review_flag).length;
          const Icon = FAMILY_ICONS[family];

          const allVerified = verifiedCount === determinations.length && determinations.length > 0;
          const hasReview = reviewCount > 0;

          const borderColor = isOutOfScope
            ? "border-l-slate-700"
            : hasReview
            ? "border-l-amber-500"
            : allVerified
            ? "border-l-teal-400"
            : "border-l-red-500";

          const glowClass = isOutOfScope
            ? ""
            : allVerified
            ? "hover:glow-verified"
            : hasReview
            ? "hover:glow-amber"
            : "";

          return (
            <motion.div
              key={family}
              role="button"
              tabIndex={isOutOfScope ? -1 : 0}
              onClick={() => !isOutOfScope && openReport(family)}
              onKeyDown={(e) => {
                if (!isOutOfScope && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  openReport(family);
                }
              }}
              className={`border-l-4 ${borderColor} rounded-xl p-3.5 transition-all duration-300 ${glowClass} ${
                isOutOfScope
                  ? "opacity-30 cursor-default bg-slate-900/40"
                  : "cursor-pointer glass hover:bg-slate-800/80"
              }`}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              whileHover={isOutOfScope ? {} : { y: -2, transition: { duration: 0.2 } }}
              whileTap={isOutOfScope ? {} : { scale: 0.98 }}
            >
              <div className="flex items-center gap-2 mb-2">
                {Icon && (
                  <Icon
                    size={14}
                    className={isOutOfScope ? "text-slate-600" : "text-cyan-300/70"}
                  />
                )}
                <span className="text-sm font-semibold text-slate-100">
                  {FAMILY_LABELS[family]}
                </span>
              </div>
              {isOutOfScope ? (
                <div className="text-xs text-slate-500">Not triggered</div>
              ) : (
                <>
                  <div className="text-xs text-slate-400 mb-2.5 line-clamp-2 leading-relaxed">
                    {determinations.map((d) => d.requirement).join(" · ")}
                  </div>
                  <div className="flex gap-2.5 text-[10px] font-medium">
                    {verifiedCount > 0 && (
                      <span className="flex items-center gap-1 text-teal-400">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-400" />
                        {verifiedCount} verified
                      </span>
                    )}
                    {reviewCount > 0 && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                        {reviewCount} review
                      </span>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
