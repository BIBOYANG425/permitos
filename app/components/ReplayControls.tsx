"use client";
import { useStore } from "@/lib/ui/store";
import { skipReplay } from "@/lib/ui/useReplay";

export function ReplayControls() {
  const speed = useStore((s) => s.replaySpeed);
  const setSpeed = useStore((s) => s.setSpeed);
  const replayDone = useStore((s) => s.replayDone);
  const run = useStore((s) => s.run);
  if (!run) return null;
  return (
    <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6, padding: 6, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, zIndex: 10 }}>
      {([1, 2] as const).map((s) => (
        <button key={s} onClick={() => setSpeed(s)} style={{ padding: "2px 8px", background: speed === s ? "var(--accent)" : "transparent", color: speed === s ? "white" : "var(--text-dim)", border: 0, borderRadius: 4, cursor: "pointer", fontSize: 11 }}>{s}×</button>
      ))}
      <button disabled={replayDone} onClick={skipReplay} style={{ padding: "2px 8px", background: "transparent", color: replayDone ? "var(--text-dim)" : "var(--text)", border: "1px solid var(--border)", borderRadius: 4, cursor: replayDone ? "default" : "pointer", fontSize: 11 }}>Skip</button>
    </div>
  );
}
