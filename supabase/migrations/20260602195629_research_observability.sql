create table if not exists public.research_runs (
  id bigserial primary key,
  run_id text not null,
  ts timestamptz not null default now(),
  model text,
  status text,
  n_determinations int,
  n_verified int,
  n_needs_review int,
  n_investigated int,
  n_invariant_violations int
);

create table if not exists public.eval_scorecards (
  id bigserial primary key,
  ts timestamptz not null default now(),
  model text,
  n_runs int,
  recall double precision,
  grounding double precision,
  accuracy double precision,
  total_cost_usd double precision,
  cost_per_determination_p50_usd double precision,
  cost_per_determination_p95_usd double precision,
  spawn_latency_avg_ms double precision,
  spawn_latency_p95_ms double precision
);
