# PROPOSED — canonical recovered-score distribution method

**Status:** PROPOSED — NOT ACTIVE

**Model:** Football v0.2.47-R PRE-HARDENING

**Production authority:** `/model/MODEL_STATE.json`

This proposal does not change model state, enable `/verdict`, or create official bets.

## Problem

The downstream market chain is now reconstructed:

```text
structure / routes / XI / situation
→ goal band / central anchor
→ categorical settlement-protection envelope
→ goal probability distribution
→ exact Asian fair odds / EV
→ market comparison
```

The unresolved step has been the conversion of recovered score scenarios into a probability distribution. Historical records preserved examples such as:

```text
primary: 2-1 / 3-1 / 2-2
upside: 3-2
```

but did not preserve explicit scenario probabilities.

Pure Poisson and a max-EV-only selector are not authorized because they conflict with recovered model behavior.

## Benchmark

The research benchmark compares six non-Poisson candidate methods against five explicit historical projection cases and four recovered market-reference boards.

Proposal criteria are intentionally stricter than market fit alone:

1. retain positive mass on every recorded score scenario;
2. use no tuned numeric hyperparameter;
3. keep every projected mean inside its recovered historical goal range;
4. rank all four recovered market references first under exact Asian expected-P/L math.

### Results

| Candidate | Range | Market refs | Preserves upside | Parameter-free | Proposal eligible |
| --- | ---: | ---: | --- | --- | --- |
| Equal all scenarios | 5/5 | 3/4 | yes | yes | no |
| Half-weight upside | 5/5 | 3/4 | yes | no | no |
| 1 / primary-count upside | 5/5 | 3/4 | yes | yes | no |
| **1 / total-scenario-count upside** | **5/5** | **4/4** | **yes** | **yes** | **yes** |
| Fixed 0.10 upside | 5/5 | 4/4 | yes | no | no |
| Primary-only control | 5/5 | 4/4 | no | yes | no |

The heavier tail candidates all change the Hiroshima–Kawasaki benchmark from O3.25 to O3.5. The fixed 0.10 tail fits but is a free fitted constant. The primary-only control fits but discards recorded evidence.

## Proposed method

For every explicitly recovered/generated score-scenario set:

```text
primary scoreline weight = 1
upside scoreline weight = 1 / total recorded scenario count
```

Then:

1. aggregate scorelines by total goals;
2. normalize the resulting mass to 1;
3. do not add unobserved scorelines;
4. do not apply Poisson smoothing;
5. pass the distribution to the existing exact Asian market math.

Example with three primary scenarios and one upside scenario:

```text
primary weight = 1 each
upside weight = 1 / 4
```

The resulting `0.25` is derived from the recovered scenario count, not an activated fixed tail coefficient.

If there are no recorded upside scenarios, primary scenarios remain equally weighted.

## Why this is preferred to the earlier 0.10 / 0.25 calibration

The earlier search showed that multiple light fixed tail ratios could fit the small overlap sample. That established non-identifiability.

This proposal does not claim the data uniquely identify a numerical tail probability. Instead it applies a simplicity constraint: among tested methods that fit the evidence, prefer the one that preserves all evidence and derives its tail attenuation mechanically from the scenario set rather than adding a fitted constant.

## Golden-board safety boundary

Most active v0.2.47-R golden boards do not preserve explicit score scenarios. We will not invent distributions for them merely to force an EV backtest.

The market architecture therefore remains:

```text
price floor
→ recovered categorical protection envelope
→ distribution-based EV ranking within the envelope only
```

The distribution layer cannot resurrect a rejected burden.

Club América–Monterrey remains the mandatory acceptance control:

```text
O2.5  @1.69  -> below active 1.70 floor
O2.75 @1.89  -> allowed
O3.0  @2.16  -> rejected by PROTECTION_HEAVY anchor envelope
O3.25 @2.42  -> above active maximum price and/or outside envelope
```

Thus O2.75 @1.89 is the only surviving candidate before EV ranking.

## What approval would authorize

Approval of this proposal would authorize implementation of the **scenario-to-distribution adapter** in production, subject to the following conditions:

- score scenarios must come from an approved upstream projection/template layer;
- missing scenarios fail closed; no synthetic tails or Poisson fallback;
- the existing 1.70 minimum price floor remains active;
- the categorical protection envelope remains upstream of EV ranking;
- exact Asian settlement math remains unchanged;
- top EV alone still cannot override HOLD/structure requirements;
- audited historical mistakes remain negative controls, not positive training examples;
- Sep-1 hardening rules remain inactive unless separately approved.

Approval would **not** by itself merge the branch or silently enable official betting. Runtime wiring and acceptance tests would still be committed and reviewed before `/verdict` is enabled.

## Remaining engineering after approval

1. promote the approved scenario-distribution adapter out of research code;
2. connect approved upstream score-scenario generation to it;
3. run the full post-XI shadow chain through golden and acceptance tests;
4. replace the current `/verdict` 503 guard only after those checks are available;
5. keep OFFICIAL_LOCK/HOLD state transitions append-only and auditable.

## Current state

Until explicit approval:

```text
proposal status = NOT ACTIVE
MODEL_STATE change = none
/verdict = disabled
production selection = none
```
