"use client";

import { useStore } from "@/lib/ui/store";
import { deriveSandboxTiles, type SandboxStatus } from "@/lib/ui/sandboxState";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AgentWorkstation } from "./AgentWorkstation";

const STATUS_META: Record<SandboxStatus, { label: string; cls: string }> = {
  queued: { label: "queued", cls: "border-slate-700/50 text-slate-500" },
  booting: { label: "booting sandbox", cls: "border-cyan-700/60 text-cyan-300 animate-pulse" },
  fetching: { label: "fetching source", cls: "border-cyan-700/60 text-cyan-300 animate-pulse" },
  verifying: { label: "verifying", cls: "border-indigo-700/60 text-indigo-300 animate-pulse" },
  verified: { label: "verified", cls: "border-teal-700/60 text-teal-300 glow-verified" },
  failed: { label: "verifier rejected", cls: "border-red-700/60 text-red-300" },
  repairing: { label: "repairing", cls: "border-orange-600/60 text-orange-300 animate-pulse" },
  repaired: { label: "repaired", cls: "border-teal-700/60 text-teal-300" },
  needs_review: { label: "needs review", cls: "border-amber-700/60 text-amber-300 glow-amber" },
  out_of_scope: { label: "out of scope", cls: "border-slate-800/40 text-slate-600 opacity-40" },
};

function statusProgress(status: SandboxStatus): number {
  switch (status) {
    case "queued":
      return 0;
    case "booting":
      return 15;
    case "fetching":
      return 40;
    case "verifying":
      return 65;
    case "repairing":
      return 75;
    case "verified":
    case "repaired":
    case "failed":
    case "needs_review":
      return 100;
    case "out_of_scope":
      return 0;
  }
}

export function SandboxGrid() {
  const run = useStore((s) => s.run);
  const replayedEventIds = useStore((s) => s.replayedEventIds);
  if (!run) {
    return (
      <motion.div
        className="flex h-full items-center justify-center text-sm text-slate-500 gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Loader2 size={16} className="animate-spin text-cyan-400" />
        Launching research swarm…
      </motion.div>
    );
  }

  const tiles = deriveSandboxTiles(run, replayedEventIds);
  const workers = tiles.filter((t) => t.active).length;

  return (
    <div className="h-full overflow-auto p-4">
      <motion.h2
        className="brand-label mb-3"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        Agent Operations Room · {workers} workers spawned
      </motion.h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {tiles.map((tile, i) => {
            const meta = STATUS_META[tile.status];
            const progress = statusProgress(tile.status);
            return (
              <motion.div
                key={tile.id}
                className={`glass rounded-xl overflow-hidden transition-all duration-300 ${meta.cls}`}
                initial={{ opacity: 0, y: 16, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                layout
              >
                {/* Animated agent scene */}
                <AgentWorkstation
                  family={tile.family}
                  status={tile.status}
                  progress={progress}
                  index={i}
                />

                {/* Info below */}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-100">
                      {tile.family.replace(/_/g, " ")}
                    </div>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${meta.cls}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {tile.label}
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2.5">
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          tile.status === "needs_review" || tile.status === "failed"
                            ? "bg-gradient-to-r from-amber-400 to-orange-500"
                            : "bg-gradient-to-r from-cyan-400 via-indigo-400 to-teal-400"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
