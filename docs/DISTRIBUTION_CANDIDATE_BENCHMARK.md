# Distribution Candidate Benchmark

Status: **RESEARCH ONLY — NOT ACTIVE**

Production model authority remains `/model/MODEL_STATE.json`. Nothing in this document or the research package can issue an official LOCK/HOLD verdict.

## Objective

The final unresolved modeling gap was converting recovered score scenarios into one total-goal probability distribution without inventing a Poisson model or match-specific probability weights.

The benchmark compares simple non-Poisson scenario-weighting methods against the five recovered projection cases in `projection_recovery_cases.json`.

A method is considered **proposal-eligible** only if it satisfies all four conditions:

1. every recorded primary and upside scoreline remains represented with positive mass;
2. the method introduces no tuned numeric hyperparameter;
3. every projected mean remains inside the historical expected-total range;
4. every recovered market reference ranks first by exact Asian expected P/L after the active 1.70 price floor.

Proposal eligibility is not production approval.

## Candidates

### EQUAL_ALL_SCENARIOS

All recovered scorelines receive equal weight.

Result: historical goal ranges remain intact, but Hiroshima–Kawasaki flips from the recovered O3.25 benchmark to O3.5. Rejected.

### HALF_UPSIDE_WEIGHT

Primary scorelines receive weight 1; upside scorelines receive weight 0.5.

Result: Hiroshima–Kawasaki again flips to O3.5. It also introduces a fixed 0.5 constant with no recovered historical authority. Rejected.

### RECIPROCAL_PRIMARY_COUNT_UPSIDE

Primary scorelines receive weight 1; each upside scoreline receives `1 / primary_score_count`.

For the common three-primary/one-upside pattern this gives upside weight 1/3.

Result: goal ranges remain intact but Hiroshima–Kawasaki still flips to O3.5. Rejected.

### RECIPROCAL_TOTAL_SCENARIO_COUNT_UPSIDE

Primary scorelines receive weight 1; each upside scoreline receives:

```text
1 / (primary_score_count + upside_score_count)
```

For the recovered three-primary/one-upside examples this produces 1/4, but **0.25 is not hard-coded**. It follows mechanically from the number of recovered scenarios.

Result on the current overlap sample:

- 5/5 historical expected-total ranges retained;
- 4/4 recovered market references rank first by exact Asian expected P/L;
- all recorded upside scenarios retain positive mass;
- no tunable numeric hyperparameter.

This is the only currently tested candidate satisfying all proposal criteria.

### LIGHT_UPSIDE_010

Primary scorelines receive weight 1; upside scorelines receive 0.10.

Result: 5/5 ranges and 4/4 market references pass, but the fixed `0.10` is a tuned constant not recovered from model history. It remains evidence that a light upside tail can work, not a canonical rule.

### PRIMARY_ONLY_CONTROL

Only primary scorelines receive probability mass.

Result: 5/5 ranges and 4/4 market references pass, but it discards explicitly recorded upside scorelines. It is therefore a lower-tail control, not an acceptable reconstruction.

## Why this is stronger than choosing 0.10 or 0.25 directly

Earlier calibration showed both 1:0.10 and 1:0.25 primary-to-upside ratios could satisfy the small overlap sample. That was non-identifiable.

The reciprocal-total method adds a non-market-fitting criterion: the tail weight is derived from the recovered scenario set itself rather than selected as a free constant. This makes it simpler and less tuned than the fixed-ratio survivors.

It still does **not** prove the historical model literally used this formula.

## Golden market controls

Most golden v0.2.47-R boards do not preserve explicit score-scenario distributions, so the benchmark refuses to synthesize match distributions merely to make those boards testable.

Instead the existing shadow architecture enforces the golden safety property:

```text
context / anchor
→ categorical market envelope
→ candidate distribution
→ exact Asian EV / fair odds
```

The distribution layer can rank only offers already allowed by the recovered settlement-protection envelope. It cannot expand that envelope.

This preserves key controls such as Club América–Monterrey, where the active 1.70 floor removes O2.5 @1.69 and the PROTECTION_HEAVY envelope leaves only O2.75 @1.89 before any EV ranking occurs.

The full golden set continues to require the historical selected offer to survive the categorical envelope.

## Current proposal-worthy method

```text
primary scoreline weight = 1
upside scoreline weight = 1 / total recovered scenario count
normalize after aggregation by total goals
no Poisson smoothing
no invented tail scores
```

For a case with no recorded upside scoreline, all primary scorelines remain equally weighted.

## Important limitations

- Only five explicit projection cases are currently available, with four historical market-reference boards.
- Most are historical reconstruction rows rather than clean active-v0.2.47-R locks.
- The benchmark selects among tested candidate families; it does not prove uniqueness over every conceivable weighting rule.
- Score-scenario recovery upstream remains essential. The method cannot invent primary or upside scorelines when history/runtime structure does not supply them.
- Top EV remains diagnostic until final production activation is explicitly approved.

## Research command

```bash
cd apps/api
python scripts/benchmark_distribution_candidates.py
```

The report always returns `production_ready: false` and blocker `RESEARCH_ONLY_DISTRIBUTION_METHOD_NOT_APPROVED`.
