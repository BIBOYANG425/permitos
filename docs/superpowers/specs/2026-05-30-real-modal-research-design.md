# Real Deep Research in the Modal Worker

**Date:** 2026-05-30
**Status:** Approved design, ready for implementation plan
**Base:** `main` (`feat/real-modal-research` worktree)

## Goal

Replace the Modal worker's echo-and-fixture stand-in with **genuine research**: each worker fetches the allowlisted official source live, an LLM extracts the triggering clause / verbatim quote / threshold from the real text, and the result feeds the existing verifier. Runs via `USE_MODAL=1` (CLI spawn, local/dev). The default in-process pool and the Vercel deployment keep using fixtures.

## Approved Decisions

1. **Curated source-pointer allowlist.** Keep the official `.gov` URLs (already in `SOURCE_FIXTURES`); drop the baked `quote`/`extracted` fields. The worker fetches only allowlisted URLs.
2. **Modal sandbox/function executes** the real fetch + LLM extraction.
3. **Local/dev only, via the existing CLI spawn** (`modal run worker.py`). The Vercel-deployed app cannot spawn the `modal` CLI, so it stays on the local fixture pool. Real research on Vercel (a deployed Modal web endpoint) is out of scope.
4. **Drop fixtures** — accept loss of the scripted HMBP fail→repair beat; grounding is now genuinely checked.
5. **Extractor model:** OpenAI `gpt-4o-mini`, via a Modal secret holding `OPENAI_API_KEY`.

## Architecture

```
runModalResearchPool(tasks, hypotheses)            # src/lib/research/modal/runModalPool.ts
  per task: modal run worker.py --task-json {task_id, hypothesis_id}
            ↓ (on Modal cloud)
  worker.py research_task:
    url(s) = SOURCE_POINTERS[hypothesis_id]         # allowlist; refuse other domains
    bytes  = fetch(url) (httpx, bounded)            # real GET
    text   = parse(bytes)                           # pypdf for PDF, strip tags for HTML
    hash   = sha256(bytes); fetched_at = now
    out    = openai_extract(text, hypothesis)       # structured: clause/quote/threshold/field/applies
    bundle = assemble_evidence(url, hash, fetched_at, out)
  → EvidenceBundle JSON (last stdout line, PERMITPILOT_BUNDLE_JSON-marked)
            ↓
  verifier (grounding + predicate math) → synthesis
```

### Components

- **`SOURCE_POINTERS` registry** (in `worker.py`) — `hypothesis_id → [official_url]`. Same URLs as today, minus the baked quotes/extracted. The single allowlist the worker may fetch.
- **`fetch_source(url)`** (worker.py) — `httpx` GET with a timeout and a max-bytes cap; returns `(bytes, content_type)`. Refuses any host not in the allowlist for that hypothesis.
- **`parse_text(bytes, content_type)`** (worker.py) — PDF (`pypdf`) → text; HTML → tag-stripped text; truncate to a token budget for the LLM.
- **`extract(text, hypothesis)`** (worker.py) — OpenAI `gpt-4o-mini` with a structured-output tool returning:
  `{ field, threshold_value, triggering_clause, verbatim_quote, applies: "applies"|"does_not_apply"|"needs_review", confidence }`. `verbatim_quote` MUST be a substring of `text` (grounding); if the model can't produce one, `applies="needs_review"`.
- **`assemble_evidence(...)`** (worker.py, **pure** — unit-testable) — maps `(url, source_name, hash, fetched_at, extract_result)` → the `EvidenceBundle` dict the verifier consumes. No I/O; tested with a sample extract result.
- **Modal image + secret** — `modal.Image.debian_slim().pip_install("httpx","pypdf","openai")`; `@app.function(secrets=[modal.Secret.from_name("permitpilot-openai")])` exposing `OPENAI_API_KEY`.
- **`runModalPool.ts`** — unchanged spawn mechanism; **raise `DEFAULT_TIMEOUT_MS` 30s → 90s** (real fetch+PDF+LLM is slower). Parsing of the marked JSON line is unchanged.

## The verifier-coupling contract (the fiddly part)

`verifier.ts` reads specific `extracted_claims[].field` names:
- `H-HAZMAT-HMBP` → `liquid_gallons_threshold` (numeric, compared to chemical gallons)
- `H-STORM-CGP` → acreage threshold (compared to disturbance_acres)
- others → grounding + authority only

**Contract:** the extractor is given the expected `field` name for the hypothesis (passed in the task/prompt) and must populate `extracted_claims[0].field` with it and `threshold_value` as a number when applicable. When the extractor cannot find a numeric threshold, it emits the grounded quote with `applies="needs_review"`, and the verifier's existing missing/grounding path produces `needs_review` (fail-closed). No verifier rewrite — only: where a branch currently assumed a fixture value exists, tolerate its absence as `needs_review`.

## Data flow & error handling

- Per task: fetch → parse → extract → assemble. Any failure (HTTP error/timeout, non-allowlisted host, parse failure, LLM error, missing verbatim quote) → `needs_review` EvidenceBundle with a reason in `uncertainties`. Never fabricate a quote or threshold.
- Per-task isolation: one task failing returns a `needs_review` bundle; other workers proceed (existing `Promise.allSettled` in the bridge).
- Timeouts: worker HTTP ~15s, OpenAI ~30s, function ≤120s; TS bridge per-task 90s.

## Testing

- **Cannot run Modal in this environment** (`modal` not installed). The Modal path is verified by the user: `modal setup`, create secret `permitpilot-openai` with `OPENAI_API_KEY`, then `USE_MODAL=1 pnpm eval`.
- **What is unit-tested without Modal:**
  - `assemble_evidence()` — pure mapping from a sample extract result → valid EvidenceBundle (Python test, runnable with `python -m pytest` or a tiny `assert` script; if no Python test runner is set up, a `__main__` self-check).
  - `SOURCE_POINTERS` covers every hypothesis the planner emits (parity test against the TS hypothesis IDs).
  - TS: `runModalPool` JSON-line parsing + the 90s timeout (existing test extended).
- **Default fixture path** (`USE_MODAL` unset) and the full existing suite stay green.

## Prerequisites (user, before real research runs)

1. `modal setup` (Modal account + free credits).
2. `modal secret create permitpilot-openai OPENAI_API_KEY=sk-...`.
3. Run with `USE_MODAL=1` (e.g. `USE_MODAL=1 pnpm eval`).

## Out of Scope

- Real research on the Vercel deployment (needs a deployed Modal web endpoint, not CLI spawn).
- The planner generating hypotheses/source-pointers for arbitrary, non-seeded projects.
- Nested-sandbox isolation of the fetch (the Modal function is the isolation boundary for now).
- Re-introducing a *guaranteed* demo failure beat (now emergent).

## Success Criteria

1. `USE_MODAL=1` run fetches the real `.gov` URLs and returns EvidenceBundles whose quotes are verbatim substrings of the fetched pages (real `content_hash`, real `fetched_at`).
2. The verifier consumes them unchanged for HMBP/CGP where a numeric threshold is extracted; otherwise produces `needs_review` (fail-closed).
3. Failures degrade per-task to `needs_review`, never crash the run.
4. `assemble_evidence` + source-pointer parity are unit-tested; default fixture path + full suite stay green.
