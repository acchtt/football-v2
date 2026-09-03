# STAGED — Method C integration boundary

**Status:** STAGED / NOT ACTIVE  
**Model:** Football v0.2.47-R — PRE-HARDENING  
**Proposed method:** `RECIPROCAL_TOTAL_SCENARIO_COUNT_V1`

This document records the engineering state after the distribution-candidate benchmark. It is not activation evidence.

## What has been staged

A production-shaped adapter now exists at:

`apps/api/app/football_engine/versions/v0_2_47_R/scenario_distribution.py`

The proposed adapter implements exactly the benchmark survivor:

1. every explicitly recovered primary scoreline receives weight `1`;
2. every explicitly recovered upside scoreline receives weight `1 / total recorded scenario count`;
3. scoreline weights are aggregated by total goals;
4. the total-goal mass is normalized;
5. no unrecorded scoreline, smoothing mass, Poisson tail, grade-to-lambda transform, or match-specific coefficient is added.

The common three-primary plus one-upside pattern therefore produces an upside weight of `1/4`. The value `0.25` is derived from the scenario count rather than stored as a canonical constant.

## Fail-closed behavior

The adapter refuses to return a distribution unless its staging-only `activation_approved` gate is explicitly true.

This boolean is not a production activation mechanism. It exists only so isolated acceptance tests can execute the proposed algorithm before canonical approval. A future runtime caller must obtain activation authority from `/model/MODEL_STATE.json`; production code must not simply pass `True`.

Current blocker:

`EXPLICIT_USER_APPROVAL_REQUIRED_FOR_DISTRIBUTION_METHOD_C`

`MODEL_STATE.json` remains unchanged and contains no active distribution-method field.

## Acceptance coverage

The staged tests assert:

- the adapter fails closed without approval;
- the upside weight is derived from total scenario count;
- the weight changes when scenario count changes;
- no unobserved total-goal tail mass is invented;
- all five recovered projection means remain inside their recorded historical goal bands;
- all four cases with both explicit score scenarios and historical market-reference boards reproduce the historical reference line as top exact-Asian EV after the active 1.70 price floor is applied;
- the failed Hull–Manchester United carrier forecast remains negative/reconstruction evidence rather than validation;
- runtime API/services/schemas do not import the staged adapter;
- canonical state still requires explicit user approval;
- PRE-HARDENING remains active and Sep-1 hardening remains inactive.

## Why the live XI service is not wired yet

`AutomatedMatchUpdateService` currently receives a confirmed XI and produces a neutral XI rerank because there is no approved player-role mapping. Its persisted decision state correctly records:

- `situational_adjustment: PENDING_CANONICAL_LOGIC`
- `projected_goal_distribution: PENDING_CANONICAL_LOGIC`
- `fair_total: null`

The service does not currently possess canonical score-scenario evidence. Wiring Method C directly into that service now would require inventing score scenarios from grade, XI names, or another unsupported lookup. That would violate the reconstruction boundary.

Therefore Method C is staged at the correct seam but is not called by runtime services.

## Remaining runtime requirement after approval

Approval of Method C would authorize only the distribution transform. It would not by itself create score scenarios.

The remaining engineering task would be to persist or generate the already-recovered upstream representation:

`structure + XI + situation -> explicit primary/upside score scenarios`

Once that representation is available canonically, runtime can call Method C, then:

`distribution -> fair total -> protection envelope -> exact market comparison -> HOLD/LOCK`

No production verdict should be enabled until the upstream score-scenario producer is also explicit and covered by acceptance tests.

## Activation sequence

Required sequence remains:

1. explicit user approval of Method C;
2. add the approved method ID to canonical `MODEL_STATE.json`;
3. remove the staging-only boolean gate in favor of canonical-state authority;
4. implement the canonical score-scenario producer/persistence seam;
5. run end-to-end acceptance tests including Club América–Monterrey;
6. keep `/verdict` disabled until all blockers are cleared;
7. enable runtime verdict only through a separately reviewed commit.

This staging work does not merge the branch and does not activate any rule.
