# Eval scorecard

- Date: 2026-06-02
- Orchestration model: gpt-5.2
- Runs (items x reps): 12 (12 dataset items x reps=1)
- Wall-time: ~7m33s (nat total runtime 448.58s) for the full live run
- Approx cost: ~$0.15 orchestration LLM only (see Cost below). NOTE: the ~10-12
  Modal researcher LLM calls per run execute out-of-process on Modal and are NOT
  captured here — true end-to-end OpenAI+Modal spend is meaningfully higher.

## Primary metrics (rigorous)

- expected_program_recall: 1.000
- grounding_faithfulness: 1.000

## Directional metric (not a rigorous benchmark)

These dispositions are curated, not gold, so accuracy is **directional** only — read it as a trend, not a benchmark.

- determination_accuracy: 0.620

## Cost (derived; orchestration LLM only — Modal researcher LLM cost is separate)

- Total cost: $0.1504
- Mean cost / run: $0.0125
- Cost per determination (p50): $0.0022
- Cost per determination (p95): $0.0045

## Latency

spawn_researchers (Modal fan-out). The profiler emits avg & p95 (no p50).

- spawn_researchers avg: 19358.9 ms
- spawn_researchers p95: 54369.8 ms
- Researchers / run: 1.58
