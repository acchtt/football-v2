# Distribution Candidate Benchmark

Status: **RESEARCH BENCHMARK COMPLETE — SELECTED METHOD C IS NOW CANONICALLY ACTIVE**

Production model authority remains `/model/MODEL_STATE.json`. This benchmark itself cannot issue an official LOCK/HOLD verdict.

## Objective

This benchmark addressed the conversion of recovered score scenarios into one total-goal probability distribution without inventing a Poisson model or match-specific probability weights.

It compared simple non-Poisson scenario-weighting methods against the five recovered projection cases in `projection_recovery_cases.json`.

A method was considered proposal-eligible only if it satisfied all four conditions:

1. every recorded primary and upside scoreline remained represented with positive mass;
2. the method introduced no tuned numeric hyperparameter;
3. every projected mean remained inside the historical expected-total range;
4. every recovered market reference ranked first by exact Asian expected P/L after the active 1.70 price floor.

## Candidate results

### EQUAL_ALL_SCENARIOS

All recovered scorelines receive equal weight.

Result: historical goal ranges remained intact, but Hiroshima–Kawasaki flipped from the recovered O3.25 benchmark to O3.5. Rejected.

### HALF_UPSIDE_WEIGHT

Primary scorelines receive weight 1; upside scorelines receive weight 0.5.

Result: Hiroshima–Kawasaki again flipped to O3.5. It also introduced a fixed 0.5 constant with no recovered historical authority. Rejected.

### RECIPROCAL_PRIMARY_COUNT_UPSIDE

Primary scorelines receive weight 1; each upside scoreline receives `1 / primary_score_count`.

For the common three-primary/one-upside pattern this gives upside weight 1/3.

Result: goal ranges remained intact but Hiroshima–Kawasaki still flipped to O3.5. Rejected.

### RECIPROCAL_TOTAL_SCENARIO_COUNT_UPSIDE — APPROVED METHOD C

Primary scorelines receive weight 1; each upside scoreline receives:

```text
1 / (primary_score_count + upside_score_count)
```

For the recovered three-primary/one-upside examples this produces 1/4, but `0.25` is not hard-coded. It follows mechanically from the number of explicit scenarios.

Benchmark result:

- 5/5 historical expected-total ranges retained;
- 4/4 recovered market references ranked first by exact Asian expected P/L;
- all recorded upside scenarios retained positive mass;
- no tunable numeric hyperparameter.

This was the only tested candidate satisfying every proposal criterion and was explicitly approved by the user on 2026-09-03.

Canonical method ID:

```text
RECIPROCAL_TOTAL_SCENARIO_COUNT_V1
```

### LIGHT_UPSIDE_010

Primary scorelines receive weight 1; upside scorelines receive 0.10.

Result: 5/5 ranges and 4/4 market references passed, but the fixed `0.10` was a tuned constant not recovered from model history. Rejected as canonical method.

### PRIMARY_ONLY_CONTROL

Only primary scorelines receive probability mass.

Result: 5/5 ranges and 4/4 market references passed, but it discarded explicitly recorded upside scorelines. Rejected as canonical method.

## Why Method C was preferred

Earlier calibration showed multiple light fixed tail ratios could fit the small overlap sample, so numerical tail probability was not uniquely identified.

Method C adds a simplicity constraint: tail attenuation is derived from the explicit scenario set rather than selected as a free constant. It preserves all recorded evidence without Poisson smoothing or synthetic scorelines.

This still does not prove the historical model literally used this formula. It is the approved reconstruction selected from the tested candidate families.

## Golden market safety boundary

Most golden v0.2.47-R boards do not preserve explicit score-scenario distributions, so the benchmark refuses to synthesize distributions merely to make those boards testable.

The architecture remains:

```text
context / anchor
→ categorical market envelope
→ Method C distribution when explicit scenarios exist
→ exact Asian EV / fair odds
```

The distribution layer can rank only offers already allowed by the recovered settlement-protection envelope. It cannot expand that envelope.

This preserves Club América–Monterrey, where the active 1.70 floor removes O2.5 @1.69 and the PROTECTION_HEAVY envelope leaves only O2.75 @1.89 before any EV ranking.

## Active Method C

```text
primary scoreline weight = 1
upside scoreline weight = 1 / total explicit scenario count
normalize after aggregation by total goals
no Poisson smoothing
no invented tail scores
```

If there is no upside scoreline, primary scorelines remain equally weighted.

## Remaining limitation

Method C solves only:

```text
explicit primary/upside score scenarios
→ goal probability distribution
```

The upstream producer is still pending:

```text
structure + XI + situation
→ explicit primary/upside score scenarios
```

Canonical state therefore records `upstream_scenario_producer_status = PENDING_IMPLEMENTATION`, and `/verdict` remains disabled.

## Research command

```bash
cd apps/api
python scripts/benchmark_distribution_candidates.py
```

The benchmark report itself remains research-only and may continue to return `production_ready: false`; that flag refers to the benchmark harness, not the canonical activation status of Method C.
