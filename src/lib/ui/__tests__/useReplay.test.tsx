import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStore } from "../store";
import { useReplay } from "../useReplay";
import type { ResearchRun } from "@/lib/research/types";

const events: ResearchRun["trace_events"] = [
  { id: "e1", run_id: "r", ts: "2026-01-01T00:00:00.000Z", actor: "scope_agent", phase: "scope", status: "running", message: "" },
  { id: "e2", run_id: "r", ts: "2026-01-01T00:00:00.400Z", actor: "scope_agent", phase: "scope", status: "done", message: "" },
  { id: "e3", run_id: "r", ts: "2026-01-01T00:00:00.800Z", actor: "orchestrator", phase: "coverage", status: "done", message: "" },
];

function makeRun(): ResearchRun {
  return {
    run_id: "r", status: "done", project_facts: {}, jurisdiction_stack: [],
    scope_pack: {} as never, coverage_family_statuses: [], regulatory_angles: [],
    research_graph: [], research_tasks: [], evidence_bundles: [], verification_verdicts: [],
    repair_tickets: [], memory_updates: [], determinations: [], trace_events: events,
    report_markdown: "",
  };
}

describe("useReplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStore.getState().reset();
  });

  it("does nothing when run is null", () => {
    renderHook(() => useReplay());
    expect(useStore.getState().replayedEventIds.size).toBe(0);
  });

  it("ticks events in order and finishes", () => {
    useStore.setState({ run: makeRun() });
    renderHook(() => useReplay());

    act(() => { vi.advanceTimersByTime(50); });
    expect(useStore.getState().replayedEventIds.has("e1")).toBe(true);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(useStore.getState().replayedEventIds.has("e2")).toBe(true);
    expect(useStore.getState().replayedEventIds.has("e3")).toBe(true);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(useStore.getState().replayDone).toBe(true);
  });
});
