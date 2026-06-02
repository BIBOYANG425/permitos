# research_core

A faithful, parity-validated Python port of the deterministic EHS research core originally written in TypeScript. The pipeline covers the full scope→plan→verify/repair→synthesize→recall-floor→determinations flow and is the foundation (sub-project A) for putting the pipeline behind the NVIDIA NeMo Agent Toolkit (AIQ).

## Layout

### Package — `research_core/`

| Module | Responsibility |
|---|---|
| `types.py` | Shared type constants and sentinel values mirroring `types.ts` |
| `program_registry.py` | Static registry of all EHS programs the pipeline can investigate |
| `tool_catalog.py` | Tool IDs, role-scoped allowlists, and blocker lists for research agents |
| `scope.py` | Scope helpers (`empty_scope`, `scope_pack_from_facts`, `create_run_id`) plus the opt-in `parse_scope` LLM wrapper (Regime 2) |
| `planner.py` | `plan_research` — derives coverage-family statuses, regulatory angles, research graph, and task list from a scope pack |
| `verifier.py` | `verify_evidence`, `repair_evidence` — evidence-bundle grounding and repair-ticket generation |
| `confidence.py` | `compute_confidence` — converts source authority + grounding into a numeric confidence score |
| `synthesis.py` | `synthesize` — turns verified evidence into applicability determinations and a report |
| `completeness.py` | `verify_determination_set` — recall-floor check: flags programs expected by the registry that were never investigated |
| `pipeline.py` | `run_verification`, `finalize_run` — top-level orchestration (verify/repair loop + synthesis + recall floor) |
| `_format.py` | Shared JS-style string formatter (`js_str`, `js_num`) for null/bool serialization in template strings |

### Tests — `tests/`

| Path | Contents |
|---|---|
| `goldens/*.json` | Cross-language golden outputs exported from the TypeScript implementation — the spec, never edited by hand |
| `canonicalize.py` | Deterministic canonical form for comparison: sorts lists, drops `trace_events`, checks `report_markdown` structurally |
| `test_parity.py` | Offline golden-parity gate: re-derives 12 golden cases in Python and asserts canonical equality with the TS exports |
| `test_planner.py` | Unit tests for `plan_research` |
| `test_verifier.py` | Unit tests for `verify_evidence` and `repair_evidence` |
| `test_confidence.py` | Unit tests for `compute_confidence` |
| `test_synthesis.py` | Unit tests for `synthesize` |
| `test_completeness.py` | Unit tests for `verify_determination_set` (recall floor) |
| `test_program_registry.py` | Parity guard so the registry and hypothesis-ID lists cannot drift |
| `test_tool_catalog.py` | Unit tests for tool catalog role scoping |
| `test_types_smoke.py` | Shape smoke test for determination dicts |
| `test_run_split.py` | Integration tests for `run_verification` and `finalize_run` |
| `test_run_repair.py` | Repair-loop integration tests |
| `test_run_recall_floor.py` | Recall-floor integration tests |
| `test_canonicalize.py` | Unit tests for the canonicalizer itself |
| `test_scope_extraction.py` | Regime 2 opt-in test (requires `OPENAI_API_KEY`; skips without it) |
| `fixtures/` | Seeded evidence fixture data for integration tests |

## Testing philosophy

### Production gate (`uv run pytest -m "not migration"`)

The mechanical-guardrail unit tests: verifier grounding/threshold math, recall floor, program registry, confidence scoring, and `scope_pack_from_facts`. These cover deterministic backstops that must be reproducible regardless of which orchestration path calls them — determinism here is correct and expected. This is the CI gate for the production system.

Tests that use sample or fixture *inputs* to exercise unit behavior (e.g. the verifier fail→repair arc in `test_run_repair.py`) are legitimate guardrail tests and belong in this tier — only the *whole-pipeline golden byte-parity* in `test_parity.py` is migration-only.

### Migration regression (`uv run pytest -m migration`, plus `pnpm check:goldens`)

The whole-pipeline golden byte-parity suite on the 3 demo fixtures (`complex`, `construction`, `missing_facts`). It proved that the TS→Python port was behaviorally equivalent to the TypeScript original. It is **not a production gate**: sub-project B makes orchestration agentic and model-driven, which is non-deterministic by design — byte-matching against a deterministic demo-fixture snapshot would both fail spuriously and give false confidence about the live system. This suite will be retired or loosened once sub-project B lands.

### Production correctness for the agentic system (sub-projects B/C)

Invariants that hold on any execution path, regardless of non-determinism:

- Every shipped determination is grounded by a verbatim quote present in the fetched source.
- Nothing is marked `verified` without a passing verifier check.
- The recall floor surfaces every family the registry expects but that was never investigated.
- The system fails closed on missing facts (no silent omissions).

These are tested via an **AIQ eval harness** (sub-project C) that scores runs on determination accuracy, quote-grounding faithfulness, expected-program recall, and cost/latency. The eval harness tolerates non-determinism — it scores outcomes, not exact byte matches.

## The parity gate

The golden files in `tests/goldens/` are exported from the TypeScript implementation via the `pnpm export:goldens` script at the repo root. They capture the complete deterministic output for 3 representative scope inputs.

`test_parity.py` reads each golden, re-derives the same output in Python (calling `plan_research`, `finalize_run`, etc.), and asserts canonical equality. The canonicalizer:

- Sorts all lists that are order-independent (determinations, angles, hypotheses, tasks).
- Excludes `trace_events` from comparison (wall-clock timestamps make them non-deterministic).
- Checks `report_markdown` structurally: verifies required section headers and determination entries are present, without byte-matching prose.

A passing parity gate proved the Python port is behaviorally equivalent to the TypeScript original across all 3 golden cases. See the testing philosophy section above for the role this suite plays going forward.

## Running it

### Offline gate (no API key needed)

```bash
cd research_core
uv run pytest
```

Expected: all tests pass (or all pass with the `test_scope_extraction` test skipped if `OPENAI_API_KEY` is unset).

### Regenerate goldens from the TypeScript source

From the repo root:

```bash
pnpm export:goldens
```

### Cross-language freshness guard

Asserts the Python output still matches the (re-exported) TypeScript goldens with no diff:

```bash
pnpm check:goldens
```

## Regime 2 (opt-in LLM scope extraction)

`parse_scope` in `scope.py` wraps an OpenAI `gpt-4o-mini` call (overridable via `OPENAI_INTAKE_MODEL`) to extract structured facts from a free-text project description. It requires `OPENAI_API_KEY` and falls back gracefully to `empty_scope` when the key is absent or the call fails.

The corresponding test (`test_scope_extraction.py`) uses `pytest.mark.skipif` to skip when `OPENAI_API_KEY` is not set. It is not part of the offline parity gate.

## AIQ forward-fit

The package is designed for zero-friction registration as AIQ functions in sub-project B:

- **No import-time side effects** — all computation happens inside functions.
- **Pure functions** — `plan_research`, `synthesize`, `verify_evidence`, etc. take plain dicts and return plain dicts; no global state mutated.
- **Dependency-injected** — the optional `openai` import in `parse_scope` is lazy; the rest of the package has no runtime dependencies beyond the Python standard library.

Sub-project B wraps each stage with `@register_function` and `OpenAIModelConfig`, routing calls through the NeMo Agent Toolkit without modifying this core.
