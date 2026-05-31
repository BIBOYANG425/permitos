import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type RunStatus = "queued" | "running" | "bundles_complete" | "done" | "failed" | "stalled";

export type RunRecord = {
  run_id: string;
  status: RunStatus;
  input: unknown;
  scope_pack: unknown;
  plan: unknown;
  jurisdiction_stack: string[];
  task_count: number;
  trace_events: unknown[];
  determinations?: unknown[] | null;
  report_markdown?: string | null;
};

let testClient: SupabaseClient | null = null;
export function __setClientForTests(c: SupabaseClient | null): void { testClient = c; }

export function isStoreConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

function client(): SupabaseClient {
  if (testClient) return testClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function createRun(record: RunRecord): Promise<void> {
  const { error } = await client().from("research_runs").insert({ ...record, updated_at: new Date().toISOString() });
  if (error) throw new Error(`createRun failed: ${error.message}`);
}

export async function getRun(run_id: string): Promise<RunRecord | null> {
  const { data, error } = await client().from("research_runs").select().eq("run_id", run_id).maybeSingle();
  if (error) throw new Error(`getRun failed: ${error.message}`);
  return (data as RunRecord) ?? null;
}

export async function listEvidence(run_id: string): Promise<Array<{ hypothesis_id: string; bundle: unknown }>> {
  const { data, error } = await client().from("research_evidence").select().eq("run_id", run_id);
  if (error) throw new Error(`listEvidence failed: ${error.message}`);
  return (data as Array<{ hypothesis_id: string; bundle: unknown }>) ?? [];
}

export async function updateStatus(run_id: string, status: RunStatus): Promise<void> {
  const { error } = await client().from("research_runs").update({ status, updated_at: new Date().toISOString() }).eq("run_id", run_id);
  if (error) throw new Error(`updateStatus failed: ${error.message}`);
}

export async function finalizeRun(
  run_id: string,
  result: { determinations: unknown[]; report_markdown: string; trace_events: unknown[] }
): Promise<void> {
  const { error } = await client().from("research_runs").update({
    status: "done", determinations: result.determinations, report_markdown: result.report_markdown,
    trace_events: result.trace_events, updated_at: new Date().toISOString(),
  }).eq("run_id", run_id);
  if (error) throw new Error(`finalizeRun failed: ${error.message}`);
}
