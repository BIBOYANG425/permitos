"use client";
import { Header } from "./components/Header";
import { InputPanel } from "./components/InputPanel";

export default function Page() {
  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", height: "100vh" }}>
      <Header />
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", overflow: "hidden" }}>
        <InputPanel />
        <main style={{ position: "relative", overflow: "hidden" }}>
          <div style={{ padding: 20, color: "var(--text-dim)" }}>(graph stage — Task 8)</div>
        </main>
        <aside style={{ width: 360, borderLeft: "1px solid var(--border)", background: "var(--panel)" }}>
          <div style={{ padding: 20, color: "var(--text-dim)" }}>(side panel — Task 9)</div>
        </aside>
      </div>
      <section style={{ borderTop: "1px solid var(--border)", background: "var(--panel)", maxHeight: 320, overflow: "auto" }}>
        <div style={{ padding: 20, color: "var(--text-dim)" }}>(bottom panel — Task 10)</div>
      </section>
    </div>
  );
}
