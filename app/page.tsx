"use client";
import { Header } from "./components/Header";
import { InputPanel } from "./components/InputPanel";
import { ResearchGraph } from "./components/ResearchGraph";
import { SidePanel } from "./components/SidePanel";
import { BottomPanel } from "./components/BottomPanel";
import { EvidenceDrawer } from "./components/EvidenceDrawer";
import { useReplay } from "@/lib/ui/useReplay";

export default function Page() {
  useReplay();
  return (
    <div className="grid grid-rows-[auto_1fr_auto] h-screen bg-slate-950 text-slate-100">
      <Header />
      <div className="grid grid-cols-[320px_minmax(0,1fr)_360px] overflow-hidden relative">
        <InputPanel />
        <main className="relative overflow-hidden">
          <ResearchGraph />
        </main>
        <SidePanel />
        <EvidenceDrawer />
      </div>
      <BottomPanel />
    </div>
  );
}
