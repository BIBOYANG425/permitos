# Durable research runtime (Supabase + Modal)

Opt-in long-run path. Default stays synchronous (no setup needed). Turn on with `RESEARCH_RUNTIME=durable`.

## Provision Supabase (project gcfhexotjfmowlbzcggd)
1. Authenticate the Supabase MCP: `claude /mcp` -> supabase -> Authenticate (interactive terminal).
2. Apply `supabase/migrations/0001_research_runtime.sql` (Supabase MCP `apply_migration`, or paste in the SQL editor).

## Environment
| Name | Where | Value |
|------|-------|-------|
| `RESEARCH_RUNTIME` | Vercel + local | `durable` |
| `SUPABASE_URL` | Node (server) | project URL |
| `SUPABASE_SERVICE_KEY` | Node (server) | service-role key (never `NEXT_PUBLIC_`) |
| `NEXT_PUBLIC_SUPABASE_URL` | UI | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | UI | anon key (read-only via RLS) |
| `MODAL_START_RUN_ENDPOINT` | Node (server) | the deployed Modal `start_run` URL |
| `MODAL_RESEARCH_TOKEN` | Node + Modal secret | shared bearer token |

Modal secret `permitpilot-supabase` = `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. Then `modal deploy src/lib/research/modal/worker.py` (publishes `start_run`), copy its URL into `MODAL_START_RUN_ENDPOINT`, and redeploy Vercel.

## Flow
`POST /api/research/run` -> `{run_id, status:"queued"}` immediately. The fan-out runs detached on Modal,
writing each `EvidenceBundle` to `research_evidence`. `GET /api/research/run/:id` returns progress and,
once all bundles are in, the finalized `ResearchRun`. The UI `useDurableRun(run_id)` hook polls + subscribes
to Realtime. With `RESEARCH_RUNTIME` unset, everything behaves as the synchronous demo path.
