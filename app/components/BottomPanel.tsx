"use client";
import { useState } from "react";
import { ApplicabilityMatrix } from "./ApplicabilityMatrix";
import { ReportTab } from "./ReportTab";

export function BottomPanel() {
  const [tab, setTab] = useState<"matrix" | "report">("matrix");
  return (
    <section style={{ borderTop: "1px solid var(--border)", background: "var(--panel)", maxHeight: 320, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
        {(["matrix", "report"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 14px", background: tab === t ? "var(--panel-2)" : "transparent", color: "var(--text)", border: 0, borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent", cursor: "pointer", fontSize: 12, textTransform: "uppercase" }}>{t}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "matrix" ? <ApplicabilityMatrix /> : <ReportTab />}
      </div>
    </section>
  );
}
