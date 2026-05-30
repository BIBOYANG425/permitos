"use client";
import { useStore } from "@/lib/ui/store";
import { getRepairHistory } from "@/lib/ui/selectors";

export function EvidenceDrawer() {
  const run = useStore((s) => s.run);
  const open = useStore((s) => s.drawerOpen);
  const hypId = useStore((s) => s.selectedHypothesisId);
  const setOpen = useStore((s) => s.setDrawerOpen);
  if (!run || !open || !hypId) return null;
  const bundle = run.evidence_bundles.find((b) => b.hypothesis_id === hypId);
  const verdict = [...run.verification_verdicts].reverse().find((v) => v.hypothesis_id === hypId);
  const history = getRepairHistory(run, hypId);

  return (
    <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 420, background: "var(--panel)", borderLeft: "1px solid var(--border)", padding: 16, overflowY: "auto", zIndex: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>Evidence — {hypId}</div>
        <button onClick={() => setOpen(false)} style={{ background: "transparent", color: "var(--text-dim)", border: 0, cursor: "pointer", fontSize: 16 }}>×</button>
      </div>
      {history.length > 1 && (
        <details open style={{ marginBottom: 12, padding: 8, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 6 }}>
          <summary style={{ cursor: "pointer", fontSize: 12 }}>🔧 Repair history ({history.length} attempts)</summary>
          {history.map((h, i) => (
            <div key={i} style={{ marginTop: 8, paddingTop: 8, borderTop: i > 0 ? "1px dashed var(--border)" : 0 }}>
              <div style={{ fontSize: 12, color: h.verdict === "pass" ? "var(--green)" : "var(--red)" }}>Attempt {h.attempt} — {h.verdict.toUpperCase()}</div>
              {h.failed_check && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Failed check: {h.failed_check}</div>}
              {h.failure_reason && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Reason: {h.failure_reason}</div>}
              {h.repair_action && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Action: {h.repair_action}</div>}
              {h.quote && <blockquote style={{ margin: "4px 0", padding: "4px 8px", borderLeft: "2px solid var(--border)", fontSize: 11, fontStyle: "italic" }}>{h.quote}</blockquote>}
            </div>
          ))}
        </details>
      )}
      {bundle?.sources.map((s, i) => (
        <div key={i} style={{ marginBottom: 12, padding: 8, background: "var(--panel-2)", borderRadius: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{s.source_name}</div>
          <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--accent)" }}>{s.url}</a>
          <blockquote style={{ margin: "8px 0", padding: "6px 10px", borderLeft: "2px solid var(--accent)", fontSize: 12, fontStyle: "italic" }}>{s.quote}</blockquote>
          <div style={{ fontSize: 10, color: "var(--text-dim)" }}>fetched {s.fetched_at} · hash {s.content_hash.slice(0, 12)}</div>
        </div>
      ))}
      {verdict && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 4 }}>Verifier checks</div>
          {Object.entries(verdict.checks).map(([k, c]) => (
            <div key={k} style={{ fontSize: 11, padding: "2px 0" }}>
              <span style={{ color: c.pass ? "var(--green)" : "var(--red)" }}>{c.pass ? "✓" : "✗"}</span> {k}: <span style={{ color: "var(--text-dim)" }}>{c.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
