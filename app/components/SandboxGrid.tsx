"use client";

import { useStore } from "@/lib/ui/store";
import { deriveSandboxTiles, type SandboxStatus } from "@/lib/ui/sandboxState";
import { Loader2 } from "lucide-react";

const STATUS_META: Record<SandboxStatus, { label: string; cls: string }> = {
  queued: { label: "queued", cls: "border-slate-700/50 text-slate-500" },
  booting: { label: "booting sandbox", cls: "border-cyan-700/60 text-cyan-300 animate-pulse" },
  fetching: { label: "fetching source", cls: "border-cyan-700/60 text-cyan-300 animate-pulse" },
  verifying: { label: "verifying", cls: "border-indigo-700/60 text-indigo-300 animate-pulse" },
  verified: { label: "verified", cls: "border-teal-700/60 text-teal-300 glow-verified" },
  failed: { label: "verifier rejected", cls: "border-red-700/60 text-red-300" },
  repairing: { label: "repairing", cls: "border-orange-600/60 text-orange-300 animate-pulse" },
  repaired: { label: "repaired ✓", cls: "border-teal-700/60 text-teal-300" },
  needs_review: { label: "needs review", cls: "border-amber-700/60 text-amber-300 glow-amber" },
  out_of_scope: { label: "out of scope", cls: "border-slate-800/40 text-slate-600 opacity-40" },
};

export function SandboxGrid() {
  const run = useStore((s) => s.run);
  const replayedEventIds = useStore((s) => s.replayedEventIds);
  if (!run) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500 gap-2">
        <Loader2 size={16} className="animate-spin text-cyan-400" />
        Launching research swarm…
      </div>
    );
  }

  const tiles = deriveSandboxTiles(run, replayedEventIds);
  const workers = tiles.filter((t) => t.active).length;

  return (
    <div className="h-full overflow-auto p-4">
      <h2 className="brand-label mb-3">
        Modal Sandboxes · {workers} workers spawned
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tiles.map((tile) => {
          const meta = STATUS_META[tile.status];
          return (
            <div
              key={tile.id}
              className={`glass rounded-xl border-l-4 p-3.5 transition-all duration-300 ${meta.cls}`}
            >
              <div className="text-xs font-semibold uppercase tracking-wide">{tile.family}</div>
              <div className="mt-1.5 text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{tile.label}</div>
              <div className="mt-2.5 text-xs font-medium">{meta.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
