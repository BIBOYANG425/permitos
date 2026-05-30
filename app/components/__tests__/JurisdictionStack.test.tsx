import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { JurisdictionStack } from "../JurisdictionStack";
import { useStore } from "@/lib/ui/store";

describe("JurisdictionStack", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  // Regression: prior version used
  //   useStore((s) => s.run?.jurisdiction_stack ?? [])
  // which returns a new [] each call when run is null.
  // Zustand v5 + useSyncExternalStore detects new reference as state change
  // → re-render → new [] → infinite loop → React error #185.
  // Fixed by removing the inline default and handling fallback after selection.
  it("renders without infinite re-render loop when run is null", () => {
    const { container } = render(<JurisdictionStack />);
    // If the selector was buggy, this render would have thrown #185.
    // Empty state returns null, so container is empty but stable.
    expect(container.firstChild).toBeNull();
  });

  it("renders jurisdiction list when run is present", () => {
    useStore.setState({
      run: {
        run_id: "r",
        status: "done",
        project_facts: {},
        jurisdiction_stack: ["SCAQMD", "LA County", "CA EPA"],
        scope_pack: {} as never,
        coverage_family_statuses: [],
        regulatory_angles: [],
        research_graph: [],
        research_tasks: [],
        evidence_bundles: [],
        verification_verdicts: [],
        repair_tickets: [],
        memory_updates: [],
        determinations: [],
        trace_events: [],
        report_markdown: "",
      },
    });
    const { getByText } = render(<JurisdictionStack />);
    expect(getByText("SCAQMD")).toBeInTheDocument();
    expect(getByText("LA County")).toBeInTheDocument();
  });
});
