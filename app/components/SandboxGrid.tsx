"use client";

import { useStore } from "@/lib/ui/store";
import { deriveSandboxTiles, type SandboxStatus } from "@/lib/ui/sandboxState";

const STATUS_META: Record<SandboxStatus, { label: string; cls: string }> = {
  queued: { label: "queued", cls: "border-slate-700 text-slate-500" },
  booting: { label: "booting sandbox", cls: "border-sky-700 text-sky-300 animate-pulse" },
  fetching: { label: "fetching source", cls: "border-sky-700 text-sky-300 animate-pulse" },
  verifying: { label: "verifying", cls: "border-indigo-700 text-indigo-300 animate-pulse" },
  verified: { label: "verified", cls: "border-emerald-700 text-emerald-300" },
  failed: { label: "verifier rejected", cls: "border-red-700 text-red-300" },
  repairing: { label: "repairing", cls: "border-orange-600 text-orange-300 animate-pulse" },
  repaired: { label: "repaired ✓", cls: "border-emerald-700 text-emerald-300" },
  needs_review: { label: "needs review", cls: "border-amber-700 text-amber-300" },
  out_of_scope: { label: "out of scope", cls: "border-slate-800 text-slate-600 opacity-60" },
};

export function SandboxGrid() {
  const run = useStore((s) => s.run);
  const replayedEventIds = useStore((s) => s.replayedEventIds);
  if (!run) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Launching research swarm…
      </div>
    );
  }

  const tiles = deriveSandboxTiles(run, replayedEventIds);
  const workers = tiles.filter((t) => t.active).length;

  return (
    <div className="h-full overflow-auto p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Modal sandboxes · {workers} workers spawned
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tiles.map((tile) => {
          const meta = STATUS_META[tile.status];
          return (
            <div
              key={tile.id}
              className={`rounded border-l-4 bg-slate-900 p-3 transition-colors ${meta.cls}`}
            >
              <div className="text-xs font-semibold uppercase tracking-wide">{tile.family}</div>
              <div className="mt-1 text-[11px] text-slate-400 line-clamp-2">{tile.label}</div>
              <div className="mt-2 text-xs font-medium">{meta.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
