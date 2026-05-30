"use client";
import { useState } from "react";
import { Header } from "./components/Header";
import { InputPanel } from "./components/InputPanel";
import { ResearchGraph } from "./components/ResearchGraph";
import { SidePanel } from "./components/SidePanel";
import { BottomPanel } from "./components/BottomPanel";
import { EvidenceDrawer } from "./components/EvidenceDrawer";
import { SandboxGrid } from "./components/SandboxGrid";
import { IntakeChat } from "./components/IntakeChat";
import { useReplay } from "@/lib/ui/useReplay";
import { useStore } from "@/lib/ui/store";

export default function Page() {
  useReplay();
  const run = useStore((s) => s.run);
  const replayDone = useStore((s) => s.replayDone);
  const [showIntake, setShowIntake] = useState(true);

  if (showIntake) {
    return <IntakeChat onStarted={() => setShowIntake(false)} onSkip={() => setShowIntake(false)} />;
  }

  const showGrid = run !== null && !replayDone;

  return (
    <div className="grid grid-rows-[auto_1fr_auto] h-screen bg-slate-950 text-slate-100">
      <Header />
      <div className="grid grid-cols-[320px_minmax(0,1fr)_360px] overflow-hidden relative">
        <InputPanel />
        <main className="relative overflow-hidden">
          {showGrid ? <SandboxGrid /> : <ResearchGraph />}
        </main>
        <SidePanel />
        <EvidenceDrawer />
      </div>
      <BottomPanel />
    </div>
  );
}
