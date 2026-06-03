# Optimizer — orchestration model comparison

recall + grounding are mechanism-constant (~1.0 every model); the differentiator is cost + grounding depth (directional accuracy).

| model | recall | grounding | accuracy | total $ | $/determination (p50) |
|---|---|---|---|---|---|
| gpt-5.2 | 1.0 | 1.0 | 0.6 | 0.032018000000000005 | 0.00134155 |
| gpt-5.5 | 1.0 | 1.0 | 0.54 | 0.07959 | 0.0035684999999999996 |

**Cost-optimal (holds recall=grounding=1.0): gpt-5.2**

> Sample run 2026-06-02 (subset: 2 scopes). `gpt-5.2` holds the recall/grounding
> floors at ~40% of `gpt-5.5`'s cost with slightly higher grounding depth, so it is
> the cost-optimal orchestration model. `gpt-4o-mini` was attempted but excluded — its
> `nat eval` produced no usable profiler data (nat's bottleneck profiler raised on an
> empty DataFrame, i.e. the model did not drive the agent into normal tool steps), so
> the optimizer skipped it and compared the remaining models.
