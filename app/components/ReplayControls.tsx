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
    <div className="absolute top-3 right-3 flex gap-1.5 p-1.5 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-lg z-10 shadow-lg">
      {([1, 2] as const).map((s) => (
        <button
          key={s}
          onClick={() => setSpeed(s)}
          className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
            speed === s
              ? "bg-sky-500 text-white"
              : "bg-transparent text-slate-400 hover:text-slate-100"
          }`}
        >
          {s}×
        </button>
      ))}
      <button
        disabled={replayDone}
        onClick={skipReplay}
        className={`px-2 py-0.5 bg-transparent border border-slate-700 rounded text-[11px] transition-colors ${
          replayDone
            ? "text-slate-500 cursor-default"
            : "text-slate-100 hover:bg-slate-700 cursor-pointer"
        }`}
      >
        Skip
      </button>
    </div>
  );
}
