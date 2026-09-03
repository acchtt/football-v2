# APPROVED — canonical recovered-score distribution method

**Status:** APPROVED AND ACTIVE ON `v1/automatic-xi-results`

**Model:** Football v0.2.47-R PRE-HARDENING

**Approval:** User explicitly approved **Method C** on 2026-09-03.

**Production authority:** `/model/MODEL_STATE.json`

This document is the change-control evidence for activating the scenario-to-distribution transform. It does **not** enable `/verdict`, create official bets, or invent an upstream score-scenario producer.

## Approved Method C

For every explicitly generated primary/upside score-scenario set:

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

Canonical method ID:

```text
RECIPROCAL_TOTAL_SCENARIO_COUNT_V1
```

For a common three-primary plus one-upside scenario set, the upside weight is `1/4`. The value `0.25` is derived from scenario count and is not a fixed model coefficient.

## Evidence benchmark

The research benchmark compared six non-Poisson candidates against five explicit historical projection cases and four recovered market-reference boards.

Approval criteria were:

1. retain positive mass on every recorded score scenario;
2. use no tuned numeric hyperparameter;
3. keep every projected mean inside its recovered historical goal range;
4. rank all four recovered market references first under exact Asian expected-P/L math.

| Candidate | Range | Market refs | Preserves upside | Parameter-free | Proposal eligible |
| --- | ---: | ---: | --- | --- | --- |
| Equal all scenarios | 5/5 | 3/4 | yes | yes | no |
| Half-weight upside | 5/5 | 3/4 | yes | no | no |
| 1 / primary-count upside | 5/5 | 3/4 | yes | yes | no |
| **1 / total-scenario-count upside** | **5/5** | **4/4** | **yes** | **yes** | **yes** |
| Fixed 0.10 upside | 5/5 | 4/4 | yes | no | no |
| Primary-only control | 5/5 | 4/4 | no | yes | no |

The heavier-tail candidates changed the Hiroshima–Kawasaki market benchmark from O3.25 to O3.5. The fixed 0.10 tail fit but introduced a free fitted constant. The primary-only control fit but discarded recorded upside evidence.

This approval therefore selects the simplest tested survivor. It does not claim that historical records uniquely encoded this mathematical formula.

## Canonical activation

`MODEL_STATE.json` schema is now version 3 and contains:

```json
"projection": {
  "distribution_method": "RECIPROCAL_TOTAL_SCENARIO_COUNT_V1",
  "distribution_method_approved": true,
  "score_scenario_source": "EXPLICIT_PRIMARY_UPSIDE_SCENARIOS",
  "upstream_scenario_producer_status": "PENDING_IMPLEMENTATION",
  "synthetic_scorelines_allowed": false,
  "poisson_fallback_allowed": false
}
```

The runtime model-state validator pins these guardrails.

The production-shaped adapter at:

`apps/api/app/football_engine/versions/v0_2_47_R/scenario_distribution.py`

now reads activation authority directly from canonical model state. The previous staging-only `activation_approved=True` bypass has been removed.

## Golden-board safety boundary

The market architecture remains:

```text
structure / XI / situation
→ explicit score scenarios
→ approved Method C distribution
→ recovered central anchor / protection posture
→ eligible market envelope
→ exact Asian fair odds / EV
→ final market comparison
```

The distribution layer cannot resurrect a burden already removed by the protection envelope.

Club América–Monterrey remains the mandatory acceptance control:

```text
O2.5  @1.69  -> below active 1.70 floor
O2.75 @1.89  -> allowed
O3.0  @2.16  -> rejected by PROTECTION_HEAVY anchor envelope
O3.25 @2.42  -> above active maximum price and/or outside envelope
```

Thus O2.75 @1.89 remains the only surviving candidate before probability ranking.

## What Method C approval activates

It activates only the deterministic transform:

```text
explicit primary/upside score scenarios
→ total-goal probability distribution
```

It also authorizes production code to call that adapter **once an approved upstream score-scenario producer supplies those scenarios**.

## What remains blocked

Method C approval does **not** define:

- how structure/XI/situation creates primary score scenarios;
- how structure/XI/situation creates upside score scenarios;
- a grade-to-goals lookup;
- Poisson fallback;
- synthetic tail generation;
- a fixed price-step threshold;
- a top-EV-equals-LOCK rule;
- automatic HOLD/LOCK behavior.

Canonical state therefore explicitly records:

```text
upstream_scenario_producer_status = PENDING_IMPLEMENTATION
```

`AutomatedMatchUpdateService` still records projected distribution and fair total as pending because it has no approved score-scenario source.

`/verdict` remains disabled until that upstream seam and final decision integration are implemented and validated.

## Preserved v0.2.47-R guardrails

This approval does not alter:

- model version `v0.2.47-R`;
- `PRE-HARDENING` regime;
- Sep-1 hardening = inactive;
- recent-total/leakage confirmation = active;
- minimum Over price = 1.70;
- no blanket grade-based maximum total;
- no O3.75 hard gate;
- no youth/reserve blanket cap;
- H2H remains modifier only;
- XI names cannot create an unsupported route.

## Completed change-control sequence

```text
RECOVERED EVIDENCE
→ DISTRIBUTION CANDIDATE BENCHMARK
→ METHOD C PROPOSAL
→ PRODUCTION-SHAPED FAIL-CLOSED STAGING
→ EXPLICIT USER APPROVAL (C)
→ MODEL_STATE SCHEMA V3 + METHOD ID ACTIVATION
→ ADAPTER BOUND TO CANONICAL STATE
```

## Next engineering task

Build and persist the canonical upstream representation:

```text
structure + XI + situation
→ primary score scenarios + upside score scenarios
```

Only after that representation is explicit and acceptance-tested should runtime call Method C automatically and proceed to fair-total/market comparison.

Production merge and `/verdict` activation remain separate actions and require their normal validation gates.
