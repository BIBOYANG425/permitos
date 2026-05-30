"use client";
import { VerificationSummary } from "./VerificationSummary";
import { CoverageFamilyList } from "./CoverageFamilyList";
import { RepairTicketsCard } from "./RepairTicketsCard";
import { TraceStream } from "./TraceStream";

export function SidePanel() {
  return (
    <aside style={{ width: 360, borderLeft: "1px solid var(--border)", background: "var(--panel)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <VerificationSummary />
      <CoverageFamilyList />
      <RepairTicketsCard />
      <TraceStream />
    </aside>
  );
}
