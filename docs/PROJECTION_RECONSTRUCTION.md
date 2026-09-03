# Projection reconstruction — research only

This work is evidence and tooling, not model authority. Production model authority remains `/model/MODEL_STATE.json`. Nothing in `app/football_engine/research/` may create or enable an `OFFICIAL_LOCK`.

## Objective

Recover enough of the historical v0.2.47-style projection behavior to define, test, and eventually propose an explicit rule for:

```text
PRE structure + confirmed XI + situation
    -> projected 90-minute goal distribution
    -> exact Asian-total math
    -> protection/risk-aware market comparison
```

The historical ledger preserves goal ranges and score bands in several prematch states, but it does not preserve canonical probability weights. The reconstruction therefore keeps score scenarios and their weights separate.

## Recovered evidence

`apps/api/tests/fixtures/projection_recovery_cases.json` currently stores five explicit score-band cases. Four also contain contemporaneous market references:

- Brentford–Tottenham: expected 2-3; primary 1-1 / 2-1 / 1-2; 2-2 upside; O2.75 @1.85 historical benchmark/HOLD.
- Hiroshima–Kawasaki: expected 3-4; primary 2-1 / 3-1 / 2-2; 3-2 upside; O3.25 @1.87 benchmark/HOLD.
- Okayama–Tokyo Verdy: expected 1-2; primary 1-0 / 1-1 / 2-0; 2-1 upside; O2.0 @1.87 benchmark/HOLD.
- Kashima–Fukuoka: expected 2-3; 1-0 / 2-0 / 2-1; O2.0 @1.79 benchmark/HOLD.
- Hull–Manchester United: expected 2-4; 0-2 / 1-2 / 0-3 / 1-3; preserved as a failed forecast so reconstruction does not use only successful examples.

The market references are explicitly tagged `historical_benchmark_hold`; they are not retroactively converted into locks.

## Calibration runner

`app/football_engine/research/calibration_search.py` evaluates caller-supplied primary/upside score-band weights. It reports, for each candidate:

- projected mean goals for every recovered case;
- whether the mean stays inside the historical goal range;
- exact EV rank of the historical market reference after the canonical 1.70 price floor;
- top-EV line and price;
- aggregate range hits and market-reference top-EV hits.

It deliberately does **not** choose a winning parameter. `jointly_compatible_candidates()` only filters candidates that satisfy every currently observable constraint. Compatibility is not approval.

A CLI is provided at:

```bash
cd apps/api
python scripts/calibrate_projection_weights.py \
  --upside-ratios 0.10,0.25,0.50,3.00
```

The CLI has no default ratios; every candidate must be explicit. Its output always contains:

```text
mode = RESEARCH_ONLY
production_ready = false
blocker = RESEARCH_ONLY_CANONICAL_PROJECTION_NOT_APPROVED
```

## Current finding: weight is not uniquely identified

Using equal weight within the recovered primary score band and varying only the relative upside-tail weight, the current overlap sample does not identify one canonical ratio.

Two deliberately separated candidates, primary:upside = `1:0.10` and `1:0.25`, are both compatible with all five recovered goal ranges and all four market references under exact Asian-total EV math. A heavier `1:0.50` tail already changes the Hiroshima–Kawasaki market ranking away from the recorded O3.25 benchmark, while an extreme `1:3.00` tail also pushes recovered projected means outside historical ranges.

This is evidence of **non-identifiability**, not evidence that 0.10 or 0.25 is the correct production parameter. More overlap cases or an additional recovered structural rule are required before a projection formula can be proposed responsibly.

## Production boundary

Tests enforce that production modules outside `football_engine/research` do not import the research projection package. The public verdict endpoint remains disabled at `MARKET_RECEIVED` until a projection and market-comparison policy are explicitly approved.
