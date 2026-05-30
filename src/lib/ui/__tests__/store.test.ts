import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../store";

describe("store", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("starts in empty state", () => {
    const s = useStore.getState();
    expect(s.run).toBeNull();
    expect(s.replayedEventIds.size).toBe(0);
    expect(s.replayDone).toBe(false);
    expect(s.selectedHypothesisId).toBeNull();
  });

  it("tickReplay adds id and finishReplay flips replayDone", () => {
    const s = useStore.getState();
    s.tickReplay("e1");
    s.tickReplay("e2");
    expect(useStore.getState().replayedEventIds.has("e1")).toBe(true);
    expect(useStore.getState().replayedEventIds.has("e2")).toBe(true);
    s.finishReplay();
    expect(useStore.getState().replayDone).toBe(true);
  });

  it("select sets selected and opens drawer when replayDone", () => {
    const s = useStore.getState();
    s.finishReplay();
    s.select("hyp_x");
    expect(useStore.getState().selectedHypothesisId).toBe("hyp_x");
    expect(useStore.getState().drawerOpen).toBe(true);
  });

  it("select does not open drawer during replay", () => {
    const s = useStore.getState();
    s.select("hyp_x");
    expect(useStore.getState().selectedHypothesisId).toBe("hyp_x");
    expect(useStore.getState().drawerOpen).toBe(false);
  });
});
