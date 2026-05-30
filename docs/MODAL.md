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
  For each task it creates an ephemeral `modal.Sandbox`, runs an `echo` to
  prove sandbox isolation, then returns an `EvidenceBundle`-shaped dict
  mirrored from `src/lib/research/fixtures/sources.ts`. The final stdout line
  is marked `PERMITPILOT_BUNDLE_JSON ...` so the TS bridge can grep it.
- `src/lib/research/modal/runModalPool.ts` — Node-side bridge.
  Per task: `child_process.spawn("modal", ["run", worker, "--task-json", ...])`,
  parses the marked JSON line, returns `EvidenceBundle[]`. 30 s per-task
  timeout, per-task failures degrade to `needs_review` bundles so the
  verifier/repair loop keeps running.

## HMBP repair must still trigger in Modal mode

The `H-HAZMAT-HMBP` hypothesis seeds an intentionally overbroad claim via the
`hmbp_threshold_bad` fixture. The Python worker mirrors this fixture
faithfully, so when the verifier inspects the Modal-produced bundle it still
fails grounding (`Quote mentions threshold quantities, but extracted claim says
all hazardous material storage.`), opens a repair ticket
(`R-HAZMAT-HMBP-001`), and the second pass through `repairEvidence()` returns
the corrected `hmbp_threshold_repaired` fixture with the 55-gallon threshold.

Verification:

```bash
USE_MODAL=1 pnpm eval
# expected: PASS complex-facility: tasks=9 repairs=1 needsReview=true
```

If `repairs=1` appears in the output, the HMBP demo moment fires identically
under Modal.

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
  `src/lib/research/modal/runModalPool.ts` (currently 30 s).
- `PERMITPILOT_BUNDLE_JSON` not found in stdout — usually means the worker
  raised before reaching its final print. Re-run the worker directly to see
  the traceback:
  ```bash
  modal run src/lib/research/modal/worker.py \
    --task-json '{"task_id":"debug","hypothesis_id":"H-AIR-201"}'
  ```
