# ACTIVATED — Method C adapter / upstream integration still pending

**Status:** METHOD C ACTIVE / UPSTREAM PRODUCER PENDING  
**Model:** Football v0.2.47-R — PRE-HARDENING  
**Approved method:** `RECIPROCAL_TOTAL_SCENARIO_COUNT_V1`

This document records the engineering boundary after explicit Method C approval.

## What is now active

The production-shaped adapter exists at:

`apps/api/app/football_engine/versions/v0_2_47_R/scenario_distribution.py`

and implements exactly the approved method:

1. every explicit primary scoreline receives weight `1`;
2. every explicit upside scoreline receives weight `1 / total recorded scenario count`;
3. scoreline weights are aggregated by total goals;
4. total-goal mass is normalized;
5. no unrecorded scoreline, smoothing mass, Poisson tail, grade-to-lambda transform, or match-specific coefficient is added.

Activation authority now comes only from `/model/MODEL_STATE.json`. The staging-only boolean bypass has been removed.

Canonical state records:

```text
distribution_method = RECIPROCAL_TOTAL_SCENARIO_COUNT_V1
distribution_method_approved = true
score_scenario_source = EXPLICIT_PRIMARY_UPSIDE_SCENARIOS
upstream_scenario_producer_status = PENDING_IMPLEMENTATION
synthetic_scorelines_allowed = false
poisson_fallback_allowed = false
```

## Acceptance coverage

The tests now assert:

- canonical state is schema v3 with Method C active;
- the adapter reads activation authority from canonical state;
- no caller-side `activation_approved=True` bypass remains;
- the upside weight is derived from total scenario count;
- the weight changes with scenario count;
- no unobserved total-goal tail mass is invented;
- all five recovered projection means stay inside their recorded bands;
- all four explicit scenario + market-reference cases preserve the recovered top exact-Asian EV line;
- the failed Hull–Manchester United carrier forecast remains negative/reconstruction evidence;
- runtime API/services/schemas still do not import the adapter before the scenario producer exists;
- PRE-HARDENING remains active;
- Sep-1 hardening remains inactive;
- the 1.70 minimum price floor remains active;
- blanket grade-based line caps and O3.75 hard gates remain inactive.

## Why live XI automation is still not wired

`AutomatedMatchUpdateService` currently receives confirmed XI and produces a neutral XI rerank because no canonical player-role mapping or score-scenario producer exists.

It still correctly persists:

- `situational_adjustment: PENDING_CANONICAL_LOGIC`
- `projected_goal_distribution: PENDING_CANONICAL_LOGIC`
- `fair_total: null`

Method C is only a transform from **explicit score scenarios** to a distribution. It does not authorize creating those scenarios from grade, XI names, or arbitrary lookup rules.

Therefore production services remain disconnected from the adapter until the next upstream layer is implemented.

## Remaining runtime requirement

Build and persist:

```text
structure + XI + situation
→ explicit primary score scenarios + upside score scenarios
```

Once that exists canonically, runtime can call Method C and continue:

```text
score scenarios
→ Method C distribution
→ fair total
→ protection envelope
→ exact market comparison
→ HOLD/LOCK
```

No production verdict should be enabled before the upstream score-scenario producer and final decision path are acceptance-tested.

## Current activation sequence

Completed:

1. explicit user approval of Method C;
2. canonical schema v3 + approved method ID;
3. removal of staging-only boolean authorization;
4. adapter bound directly to canonical model state.

Still pending:

5. canonical score-scenario producer/persistence seam;
6. end-to-end runtime acceptance including Club América–Monterrey;
7. `/verdict` activation through a separately reviewed commit;
8. branch merge only when explicitly requested.

Method C is active. Automatic betting decisions are not.
