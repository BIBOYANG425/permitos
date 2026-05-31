"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { ResearchRun } from "@/lib/research/types";

// Minimal durable-run consumer: poll GET /:id, and (if Supabase Realtime is configured)
// re-fetch immediately when an evidence/run row changes. Not the full streaming rewrite.
export function useDurableRun(runId: string | null, pollMs = 3000) {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const stopped = useRef(false);

  useEffect(() => {
    if (!runId) return;
    stopped.current = false;

    async function refetch() {
      const resp = await fetch(`/api/research/run/${runId}`);
      if (!resp.ok) return;
      const data = await resp.json();
      setStatus(data.status);
      if (data.determinations) setRun(data as ResearchRun);
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const sb = url && key ? createClient(url, key) : null;
    const channel = sb
      ? sb.channel(`run-${runId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "research_evidence", filter: `run_id=eq.${runId}` }, () => void refetch())
          .on("postgres_changes", { event: "*", schema: "public", table: "research_runs", filter: `run_id=eq.${runId}` }, () => void refetch())
          .subscribe()
      : null;

    void refetch();
    const timer = setInterval(() => { if (!stopped.current && status !== "done") void refetch(); }, pollMs);

    return () => { stopped.current = true; clearInterval(timer); if (sb && channel) void sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return { run, status };
}
