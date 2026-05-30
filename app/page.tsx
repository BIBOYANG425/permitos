"use client";
import { Header } from "./components/Header";
import { InputPanel } from "./components/InputPanel";
import { ResearchGraph } from "./components/ResearchGraph";
import { SidePanel } from "./components/SidePanel";
import { useReplay } from "@/lib/ui/useReplay";

export default function Page() {
  useReplay();
  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", height: "100vh" }}>
      <Header />
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", overflow: "hidden" }}>
        <InputPanel />
        <main style={{ position: "relative", overflow: "hidden" }}>
          <ResearchGraph />
        </main>
        <SidePanel />
      </div>
      <section style={{ borderTop: "1px solid var(--border)", background: "var(--panel)", maxHeight: 320, overflow: "auto" }}>
        <div style={{ padding: 20, color: "var(--text-dim)" }}>(bottom panel — Task 10)</div>
      </section>
    </div>
  );
}
