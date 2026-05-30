"use client";
import { useStore } from "@/lib/ui/store";

export function JurisdictionStack() {
  const stack = useStore((s) => s.run?.jurisdiction_stack ?? []);
  if (stack.length === 0) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-2">
        Jurisdiction stack
      </div>
      {stack.map((j) => (
        <div
          key={j}
          className="text-xs text-slate-100 py-1 border-b border-dashed border-slate-700 last:border-b-0"
        >
          {j}
        </div>
      ))}
    </div>
  );
}
