"use client";
import { useStore } from "@/lib/ui/store";

export function ReportTab() {
  const md = useStore((s) => s.run?.report_markdown ?? "");
  if (!md) return <div style={{ padding: 12, color: "var(--text-dim)" }}>No report yet.</div>;
  return (
    <pre style={{ padding: 16, margin: 0, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 12, lineHeight: 1.5, color: "var(--text)" }}>{md}</pre>
  );
}
