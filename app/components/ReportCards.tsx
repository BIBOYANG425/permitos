"use client";
import { useStore } from "@/lib/ui/store";
import { groupDeterminationsByFamily } from "@/lib/ui/selectors";
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

const FAMILY_ORDER: CoverageFamily[] = ["air", "stormwater", "hazmat", "waste", "wastewater"];

export function ReportCards() {
  const run = useStore((s) => s.run);
  const replayDone = useStore((s) => s.replayDone);
  const openReport = useStore((s) => s.openReport);

  if (!run || !replayDone) return null;

  const grouped = groupDeterminationsByFamily(run);
  const familyStatusMap = new Map(run.coverage_family_statuses.map((s) => [s.family, s]));

  return (
    <section className="border-t border-slate-800 bg-slate-900 p-4">
      <div className="grid grid-cols-5 gap-3">
        {FAMILY_ORDER.map((family) => {
          const report = grouped.get(family);
          const status = familyStatusMap.get(family);
          const isOutOfScope = status?.status === "out_of_scope";
          const determinations = report?.determinations ?? [];
          const verifiedCount = determinations.filter((d) => d.verified).length;
          const reviewCount = determinations.filter((d) => d.review_flag).length;

          const borderColor = isOutOfScope
            ? "border-l-slate-600"
            : reviewCount > 0
            ? "border-l-amber-500"
            : verifiedCount === determinations.length && determinations.length > 0
            ? "border-l-emerald-500"
            : "border-l-red-500";

          return (
            <div
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
              className={`border-l-4 ${borderColor} rounded-md bg-slate-800 p-3 transition-colors ${
                isOutOfScope
                  ? "opacity-40 cursor-default"
                  : "cursor-pointer hover:bg-slate-700"
              }`}
            >
              <div className="text-sm font-semibold text-slate-100 mb-2">
                {FAMILY_LABELS[family]}
              </div>
              {isOutOfScope ? (
                <div className="text-xs text-slate-400">Not triggered</div>
              ) : (
                <>
                  <div className="text-xs text-slate-400 mb-2 line-clamp-2">
                    {determinations.map((d) => d.requirement).join(" + ")}
                  </div>
                  <div className="flex gap-2 text-[10px]">
                    {verifiedCount > 0 && (
                      <span className="text-emerald-400">
                        {verifiedCount} verified
                      </span>
                    )}
                    {reviewCount > 0 && (
                      <span className="text-amber-400">
                        {reviewCount} review
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
