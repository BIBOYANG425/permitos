"use client";
import { useStore } from "@/lib/ui/store";

export function MissingFactsCard() {
  const run = useStore((s) => s.run);
  const missing = run?.scope_pack?.missing_facts ?? [];
  if (missing.length === 0) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-2">
        Missing facts ({missing.length})
      </div>
      {missing.map((m) => (
        <div key={m.field} className="mb-2.5 last:mb-0">
          <div className="text-xs text-amber-500">⚠ {m.field}</div>
          <div className="text-[11px] text-slate-400">{m.why_needed}</div>
          <div className="text-[11px] text-slate-400">Blocks: {m.blocks.join(", ")}</div>
          <input
            disabled
            placeholder="Provide value (v2)"
            title="v2 feature"
            className="mt-1 w-full px-1.5 py-1 bg-slate-950 text-slate-400 border border-slate-700 rounded text-xs cursor-not-allowed"
          />
        </div>
      ))}
    </div>
  );
}
