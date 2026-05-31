# Modal Sandbox Research Pool

PermitPilot's research subagents can run inside [Modal](https://modal.com)
Sandboxes, one ephemeral sandbox per `ResearchTask`. The default path keeps the
existing in-process mock pool; setting `USE_MODAL=1` swaps it for the Modal-backed
pool with zero changes elsewhere in the pipeline.

## One-time setup

```bash
uv tool install modal      # or: pipx install modal, or pip install --user modal
modal setup                # opens browser, writes ~/.modal.toml
```

Modal gives every account $30 of free credit. The cost per research task is
under $0.0001 — hundreds of demo runs fit inside the free tier.

## Running

```bash
# Default — fast, in-process mock pool (no Modal calls):
pnpm eval

# Modal-backed pool — spins up one ephemeral Modal Sandbox per task:
USE_MODAL=1 pnpm eval
```

The first `modal run` of the session cold-starts the app image (~5–15 s); warm
calls return in sub-second. Helper script:

```bash
./scripts/test-modal.sh
```

## Architecture

```
runResearch()
  └─ runLocalResearchPool(tasks, hypotheses)        # src/lib/research/workers.ts
        ├─ USE_MODAL unset  → in-process fixture lookup (default)
        └─ USE_MODAL=1      → runModalResearchPool() spawns one
                              `modal run worker.py --task-json <spec>`
                              per task in parallel
```

- `src/lib/research/modal/worker.py` — Modal app `permitpilot-research`.
  For each task it fetches the allowlisted official `.gov` source
  (`SOURCE_POINTERS` in `worker_core.py`), parses PDF (`pymupdf`) or HTML
  (`beautifulsoup4`), and asks `gpt-4o-mini` to extract the triggering clause +
  a **verbatim quote** + threshold. The quote is grounding-checked
  (whitespace-normalized substring of the fetched text); any fetch/parse/extract
  failure or missing/ungrounded quote degrades to a `needs_review` bundle. The final stdout line is marked
  `PERMITPILOT_BUNDLE_JSON ...` so the TS bridge can grep it.
- `src/lib/research/modal/worker_core.py` — pure registry + `assemble_evidence`,
  unit-tested via `python3 src/lib/research/modal/worker_core_test.py` (no Modal needed).
- `src/lib/research/modal/runModalPool.ts` — Node-side bridge.
  Per task: `child_process.spawn("modal", ["run", worker, "--task-json", ...])`,
  parses the marked JSON line, returns `EvidenceBundle[]`. 90 s per-task
  timeout, per-task failures degrade to `needs_review` bundles so the
  verifier/repair loop keeps running.

## Prerequisites for real research

```bash
modal setup                                            # Modal account + free credits
modal secret create permitpilot-openai OPENAI_API_KEY=sk-...
USE_MODAL=1 pnpm eval                                  # exercises the real worker
```

Without these, leave `USE_MODAL` unset — the in-process fixture pool runs (and is
what the Vercel deployment uses; the `modal` CLI cannot run there).

## The demo beat is now emergent, not scripted

Real research dropped the seeded fixtures, so the HMBP fail→repair moment is no
longer guaranteed. The verifier checks grounding against whatever `gpt-4o-mini`
actually extracts from the live `.gov` page: if the extracted verbatim quote
supports the claim the row verifies directly; if it doesn't (or no quote is
found) the row goes `needs_review`. The bounded repair loop still exists, but
whether it fires depends on the live source + extraction — it is not a
hard-coded demo step anymore.

Verification (after the prerequisites above):

```bash
USE_MODAL=1 pnpm eval
# a run completes with real sources/quotes; row outcomes are emergent.
```

## Cost

| Item | Cost |
| --- | --- |
| Modal sandbox startup | ~$0.00005 |
| 30 s of CPU sandbox runtime | ~$0.00005 |
| Per research task (~9 per eval case) | ~$0.0001 |
| Full `pnpm eval` (3 cases) | ~$0.003 |

The free $30 credit covers thousands of full eval runs.

## Troubleshooting

- `modal: command not found` — install the CLI: `uv tool install modal`.
- `modal_proto.api_pb2 ... Unauthenticated` — run `modal setup` to create
  `~/.modal.toml`.
- Per-task timeout error from `runModalPool` — bump `DEFAULT_TIMEOUT_MS` in
  `src/lib/research/modal/runModalPool.ts` (currently 90 s).
- `permitpilot-openai` secret missing / `OPENAI_API_KEY` not set — the worker's
  extraction step raises and the task degrades to `needs_review`; create the
  secret with `modal secret create permitpilot-openai OPENAI_API_KEY=sk-...`.
- `PERMITPILOT_BUNDLE_JSON` not found in stdout — usually means the worker
  raised before reaching its final print. Re-run the worker directly to see
  the traceback:
  ```bash
  modal run src/lib/research/modal/worker.py \
    --task-json '{"task_id":"debug","hypothesis_id":"H-AIR-201"}'
  ```
