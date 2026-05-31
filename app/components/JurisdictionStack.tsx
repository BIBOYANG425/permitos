"use client";
import { useStore } from "@/lib/ui/store";

export function JurisdictionStack() {
  // Subscribe to `run` directly. Do NOT use `s.run?.jurisdiction_stack ?? []`
  // as a selector — Zustand v5 + useSyncExternalStore compares with Object.is,
  // and `?? []` returns a new array each call when run is null, triggering an
  // infinite re-render loop (React error #185 in prod).
  const run = useStore((s) => s.run);
  const stack = run?.jurisdiction_stack;
  if (!stack || stack.length === 0) return null;
  return (
    <div className="glass rounded-xl p-3">
      <div className="brand-label mb-2" style={{ fontSize: 11 }}>
        Jurisdiction stack
      </div>
      {stack.map((j) => (
        <div
          key={j}
          className="text-xs text-slate-100 py-1.5 border-b border-dashed border-slate-700/40 last:border-b-0"
        >
          {j}
        </div>
      ))}
    </div>
  );
}
