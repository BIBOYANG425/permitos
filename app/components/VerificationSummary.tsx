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
    ["✓ Verified", `${c.verified}`, "var(--green)", "verified"],
    ["⚠ Needs Review", `${c.needs_review}`, "var(--yellow)", "needs_review"],
    ["✗ Failed (open)", c.repairs_ran > 0 ? `${c.failed_open} / was ${c.repairs_ran}` : `${c.failed_open}`, "var(--red)", "failed"],
    ["🔧 Repairs ran", `${c.repairs_ran}`, "var(--orange)", "all"],
    ["🔒 Blocked", `${c.blocked}`, "var(--gray)", "blocked"],
  ];
  return (
    <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8 }}>Verification</div>
      {rows.map(([label, count, color, key]) => (
        <button
          key={label}
          onClick={() => setFilter(key)}
          style={{
            display: "flex", justifyContent: "space-between", width: "100%",
            padding: "6px 8px", marginBottom: 2, background: filter === key ? "var(--panel-2)" : "transparent",
            color: "var(--text)", border: 0, borderRadius: 4, cursor: "pointer", fontSize: 12,
          }}
        >
          <span style={{ color }}>{label}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{count}</span>
        </button>
      ))}
    </div>
  );
}
