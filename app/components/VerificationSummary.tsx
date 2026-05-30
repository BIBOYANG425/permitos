"use client";
import { useStore, type MatrixFilter } from "@/lib/ui/store";
import { getVerificationCounts } from "@/lib/ui/selectors";

export function VerificationSummary() {
  const run = useStore((s) => s.run);
  const setFilter = useStore((s) => s.setMatrixFilter);
  const filter = useStore((s) => s.matrixFilter);
  if (!run) return null;
  const c = getVerificationCounts(run);
  const rows: Array<[label: string, count: string, color: string, key: MatrixFilter]> = [
    ["✓ Verified", `${c.verified}`, "text-emerald-500", "verified"],
    ["⚠ Needs Review", `${c.needs_review}`, "text-amber-500", "needs_review"],
    [
      "✗ Failed (open)",
      c.repairs_ran > 0 ? `${c.failed_open} / was ${c.repairs_ran}` : `${c.failed_open}`,
      "text-red-500",
      "failed",
    ],
    ["🔧 Repairs ran", `${c.repairs_ran}`, "text-orange-500", "all"],
    ["🔒 Blocked", `${c.blocked}`, "text-slate-500", "blocked"],
  ];
  return (
    <div className="p-3 border-b border-slate-800">
      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-2">
        Verification
      </div>
      {rows.map(([label, count, color, key]) => (
        <button
          key={label}
          onClick={() => setFilter(key)}
          className={`flex justify-between w-full px-2 py-1.5 mb-0.5 rounded text-xs text-slate-100 transition-colors ${
            filter === key ? "bg-slate-800" : "bg-transparent hover:bg-slate-800/60"
          }`}
        >
          <span className={color}>{label}</span>
          <span className="tabular-nums">{count}</span>
        </button>
      ))}
    </div>
  );
}
