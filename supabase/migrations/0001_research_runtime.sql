create table if not exists research_runs (
  run_id text primary key,
  status text not null default 'queued',
  input jsonb,
  scope_pack jsonb,
  plan jsonb,
  jurisdiction_stack jsonb,
  task_count int not null default 0,
  determinations jsonb,
  report_markdown text,
  trace_events jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists research_evidence (
  run_id text not null references research_runs(run_id) on delete cascade,
  hypothesis_id text not null,
  bundle jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id, hypothesis_id)
);

alter table research_runs enable row level security;
alter table research_evidence enable row level security;

-- Read-only access for the public anon role so the UI can subscribe via Realtime.
-- All writes use the service key, which bypasses RLS.
create policy "anon read runs" on research_runs for select to anon using (true);
create policy "anon read evidence" on research_evidence for select to anon using (true);

alter publication supabase_realtime add table research_runs;
alter publication supabase_realtime add table research_evidence;
