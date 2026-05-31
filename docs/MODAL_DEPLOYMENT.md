# Modal research endpoint — deployment

The research workers run as a Modal app exposed over HTTP so the deployed Vercel app can
reach them (Vercel serverless can't shell out to the `modal` CLI). Each research task is one
POST to this endpoint; each request runs in its own Modal container (the "sandbox"). The
worker is **all-reasoning** — it uses a reasoning-tier OpenAI model for both the agentic
tool loop and the final extraction.

Without these steps the app falls back to cached fixtures and shows a
`⚠ Modal unreachable — using cached fixtures` trace (it never crashes).

## One-time setup

1. **Auth + OpenAI secret** (already done if intake works):
   - `modal setup`
   - `modal secret create permitpilot-openai OPENAI_API_KEY=sk-...`
2. **Research token secret** — a shared bearer token the endpoint checks:
   - `modal secret create permitpilot-research RESEARCH_TOKEN=$(openssl rand -hex 24)`
   - Copy the generated token value; you set the SAME value in Vercel below.

## Deploy

```bash
modal deploy src/lib/research/modal/worker.py
```

This prints a web endpoint URL like:
`https://<workspace>--permitpilot-research-research.modal.run`

## Environment variables

Set these wherever the app runs (Vercel project → Settings → Environment Variables, for
Production + Preview; or your local `.env.local`). Redeploy / restart after setting them.

| Name | Value | Notes |
|------|-------|-------|
| `USE_MODAL` | `1` | Turns on the live research pool (else fixtures). |
| `MODAL_RESEARCH_ENDPOINT` | the deployed endpoint URL | From `modal deploy` output. |
| `MODAL_RESEARCH_TOKEN` | the token from `permitpilot-research` | Must match the secret exactly. |
| `OPENAI_RESEARCH_MODEL` | a reasoning-tier model you have access to (e.g. `o4-mini`) | Set in the **Modal secret env** (it runs inside the container), not Vercel. Defaults to `o4-mini` if unset — confirm your account has it, or override. |

> The reasoning model runs inside the Modal container, so `OPENAI_RESEARCH_MODEL` (and the
> `OPENAI_API_KEY`) are read from the Modal secrets, not Vercel. To change the model without
> redeploying code: `modal secret create permitpilot-openai OPENAI_API_KEY=sk-... OPENAI_RESEARCH_MODEL=<model>`.

## Timeouts

All-reasoning runs are slow. The pieces are tuned to match:
- Modal function `timeout` = 600s (per task / per container).
- Node fetch request timeout = 600s (`researchPool.ts`).
- Research API route `maxDuration` = 800s (Vercel fluid-compute ceiling; clamped on lesser
  plans). A run that needs longer than the platform allows is the durable
  `Function.spawn` + poll case — deferred (see `2026-05-30-live-agent-sdk-modal-runtime.md`).

## Smoke check (live)

```bash
curl -s -X POST "$MODAL_RESEARCH_ENDPOINT" \
  -H 'content-type: application/json' \
  -d '{"token":"'"$MODAL_RESEARCH_TOKEN"'","task_spec":{
        "hypothesis_id":"H-AIR-201","question":"What requires a permit to construct?",
        "allowed_tools":["get_source_pointers","get_triggers","fetch_source","prove_currency","extract_threshold","evaluate_predicate","quarantine_injection","get_cached_source"],
        "blocked_tools":["get_form","build_applicability_matrix"],
        "budget":{"max_sources":3,"max_runtime_seconds":30,"max_model_calls":4}}}'
```

Expect a JSON `EvidenceBundle` with a `sources[0].quote` grounded in SCAQMD Rule 201.
`{"error":"unauthorized"}` means the token doesn't match the secret.

## How the worker uses tools (catalog-governed)

The TypeScript planner stamps `allowed_tools`/`blocked_tools` onto each task (from
`toolCatalog.ts` role scoping) and the bridge forwards them. Inside the sandbox the LLM may
only call tools in `allowed_tools`; anything in `blocked_tools` (or not implemented) is hard-
refused. The grounding guard (the submitted quote must appear verbatim in the fetched text)
and the per-task budget caps are enforced regardless of what the model decides. If the budget
is exhausted without a grounded submission, a deterministic fetch→extract fallback runs so the
task always returns a bundle. Ungrounded or undecided findings come back as `needs_review` —
the verifier (`verifier.ts`) then refuses to mark them verified rather than rubber-stamping.
