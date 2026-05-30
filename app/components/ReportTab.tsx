"use client";
import { useStore } from "@/lib/ui/store";

export function ReportTab() {
  const md = useStore((s) => s.run?.report_markdown ?? "");
  if (!md) return <div className="p-3 text-slate-400 text-xs">No report yet.</div>;
  return (
    <pre className="p-4 m-0 whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-100">
      {md}
    </pre>
  );
}
