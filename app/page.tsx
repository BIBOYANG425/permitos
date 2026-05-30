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
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", height: "100vh" }}>
      <Header />
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", overflow: "hidden", position: "relative" }}>
        <InputPanel />
        <main style={{ position: "relative", overflow: "hidden" }}>
          <ResearchGraph />
        </main>
        <SidePanel />
        <EvidenceDrawer />
      </div>
      <BottomPanel />
    </div>
  );
}
