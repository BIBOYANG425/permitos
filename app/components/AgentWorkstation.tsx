"use client";
import { motion } from "framer-motion";
import type { SandboxStatus } from "@/lib/ui/sandboxState";
import type { CoverageFamily } from "@/lib/research/types";
import {
  Wind,
  Droplets,
  Landmark,
  Flame,
  Building2,
  Shield,
  FileSearch,
  BadgeCheck,
  Network,
} from "lucide-react";

/* ── Family → visual mapping ───────────────────────────────────────── */
const FAMILY_VISUAL: Record<
  string,
  { accent: string; icon: React.ComponentType<{ className?: string }>; screen: string }
> = {
  air: { accent: "#a3e635", icon: Wind, screen: "Air rule matrix" },
  stormwater: { accent: "#06b6d4", icon: Droplets, screen: "Watershed model" },
  land_use: { accent: "#84cc16", icon: Landmark, screen: "CEQA pathway" },
  fire_code: { accent: "#f97316", icon: Flame, screen: "Access review" },
  building: { accent: "#22c55e", icon: Building2, screen: "Permit sequence" },
  hazmat: { accent: "#f59e0b", icon: Shield, screen: "Hazmat review" },
  filing: { accent: "#f59e0b", icon: FileSearch, screen: "Filing archive" },
  verifier: { accent: "#14b8a6", icon: BadgeCheck, screen: "Citation check" },
};
const FALLBACK_VISUAL = { accent: "#2dd4bf", icon: Network, screen: "Research" };

type Props = {
  family: CoverageFamily | string;
  status: SandboxStatus;
  progress: number;
  index: number;
};

export function AgentWorkstation({ family, status, progress, index }: Props) {
  const vis = FAMILY_VISUAL[family] ?? FALLBACK_VISUAL;
  const IconComponent = vis.icon;
  const isWorking =
    status === "fetching" || status === "verifying" || status === "booting" || status === "repairing";
  const isReview = status === "needs_review" || status === "failed";

  return (
    <div
      className={`agent-scene ${isWorking ? "agent-scene-active" : ""} ${isReview ? "agent-scene-review" : ""}`}
      style={
        { "--agent-accent": vis.accent, "--agent-delay": `${index * 0.17}s` } as React.CSSProperties
      }
    >
      {/* Background elements */}
      <div className="scene-sun" />
      <div className="scene-topography" />
      <div className="scene-plant scene-plant-left">
        <span />
        <span />
        <span />
      </div>
      <div className="scene-plant scene-plant-right">
        <span />
        <span />
      </div>

      {/* Monitor */}
      <div className="work-monitor">
        <div className="monitor-bar">
          <span />
          <span />
          <span />
        </div>
        <div className="monitor-title">{vis.screen}</div>
        <div className="monitor-map">
          <i />
          <i />
          <i />
          <b style={{ width: `${Math.max(progress, 12)}%` }} />
        </div>
        <div className="monitor-lines">
          <span />
          <span />
          <span />
        </div>
        {isWorking && <div className="screen-cursor" />}
      </div>

      {/* Agent person */}
      <motion.div
        className="agent-person"
        animate={isWorking ? { y: [0, -1.5, 0] } : { y: 0 }}
        transition={{ duration: 2.2, repeat: isWorking ? Infinity : 0, delay: index * 0.1 }}
      >
        <div className="agent-chair" />
        <div className="agent-head">
          <span className="agent-hair" />
          <span className="agent-ear agent-ear-left" />
          <span className="agent-ear agent-ear-right" />
          <span className="agent-eye agent-eye-left" />
          <span className="agent-eye agent-eye-right" />
          <span className="agent-brow agent-brow-left" />
          <span className="agent-brow agent-brow-right" />
          <span className="agent-nose" />
          <span className="agent-mouth" />
          <span className="agent-cheek agent-cheek-left" />
          <span className="agent-cheek agent-cheek-right" />
          <span className="agent-headset" />
        </div>
        <div className="agent-neck" />
        <div className="agent-shoulders" />
        <div className="agent-body">
          <IconComponent className="h-3.5 w-3.5 text-slate-950/75" />
          <span className="agent-lanyard" />
        </div>
        <div className="agent-arm agent-arm-left" />
        <div className="agent-arm agent-arm-right" />
        <div className="agent-hand agent-hand-left" />
        <div className="agent-hand agent-hand-right" />
        <div className="agent-leg agent-leg-left" />
        <div className="agent-leg agent-leg-right" />
      </motion.div>

      {/* Desk */}
      <div className="work-desk">
        <div className="keyboard" />
        <div className="coffee" />
      </div>
    </div>
  );
}
