"use client";
import { VerificationSummary } from "./VerificationSummary";
import { CoverageFamilyList } from "./CoverageFamilyList";
import { RepairTicketsCard } from "./RepairTicketsCard";
import { TraceStream } from "./TraceStream";

export function SidePanel() {
  return (
    <aside
      className="border-l border-slate-800 bg-slate-900 flex flex-col overflow-hidden"
      style={{ width: 360 }}
    >
      <VerificationSummary />
      <CoverageFamilyList />
      <RepairTicketsCard />
      <TraceStream />
    </aside>
  );
}
