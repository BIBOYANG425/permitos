import { create } from "zustand";
import type { ResearchRun, ResearchRunInput, CoverageFamily } from "@/lib/research/types";

export type ReplaySpeed = 1 | 2;

export type MatrixFilter = "all" | "verified" | "needs_review" | "failed" | "blocked";

export type Store = {
  run: ResearchRun | null;
  isRunning: boolean;
  runError: string | null;
  replayedEventIds: Set<string>;
  replayDone: boolean;
  selectedHypothesisId: string | null;
  drawerOpen: boolean;
  replaySpeed: ReplaySpeed;
  matrixFilter: MatrixFilter;
  reportFamily: CoverageFamily | null;
  openReport: (family: CoverageFamily) => void;
  closeReport: () => void;
  startRun: (payload: ResearchRunInput) => Promise<void>;
  tickReplay: (eventId: string) => void;
  finishReplay: () => void;
  select: (id: string | null) => void;
  setDrawerOpen: (open: boolean) => void;
  setSpeed: (s: ReplaySpeed) => void;
  setMatrixFilter: (f: MatrixFilter) => void;
  reset: () => void;
};

const initial = {
  run: null,
  isRunning: false,
  runError: null,
  replayDone: false,
  selectedHypothesisId: null,
  drawerOpen: false,
  replaySpeed: 1 as ReplaySpeed,
  matrixFilter: "all" as MatrixFilter,
  reportFamily: null as CoverageFamily | null,
};

export const useStore = create<Store>((set, get) => ({
  ...initial,
  replayedEventIds: new Set<string>(),
  startRun: async (payload) => {
    set({ ...initial, replayedEventIds: new Set(), isRunning: true });
    try {
      const res = await fetch("/api/research/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Run failed: HTTP ${res.status}`);
      const run = (await res.json()) as ResearchRun;
      set({ run, isRunning: false });
    } catch (e) {
      set({ isRunning: false, runError: e instanceof Error ? e.message : String(e) });
    }
  },
  tickReplay: (eventId) => {
    const next = new Set(get().replayedEventIds);
    next.add(eventId);
    set({ replayedEventIds: next });
  },
  finishReplay: () => set({ replayDone: true }),
  select: (id) => set({ selectedHypothesisId: id, drawerOpen: id !== null && get().replayDone }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setSpeed: (replaySpeed) => set({ replaySpeed }),
  setMatrixFilter: (matrixFilter) => set({ matrixFilter }),
  openReport: (family) => set({ reportFamily: family }),
  closeReport: () => set({ reportFamily: null }),
  reset: () => set({ ...initial, replayedEventIds: new Set() }),
}));
