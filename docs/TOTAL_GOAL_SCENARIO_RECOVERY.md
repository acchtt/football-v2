# Total-Goal Scenario Recovery

Status: **RESEARCH ONLY**  
Active production model: **Football v0.2.47-R — PRE-HARDENING**  
Production blocker: `BAND_TO_TOTAL_GOAL_SCENARIOS_NOT_APPROVED`

## Purpose

The approved Method C distribution adapter ultimately settles Asian totals using only the
integer number of match goals. It does not need to know whether three goals arrive as
2-1, 1-2, or 3-0.

This recovery step therefore separates two questions:

1. Can approved Method C consume explicit total-goal scenarios without team scorelines?
2. Can the historical ledger identify a canonical rule that turns a recovered goal band
   and central anchor into those total-goal scenarios?

The answer to (1) is **yes**. The answer to (2) is **not yet**.

## Safe totals-only Method C seam

`build_total_goal_scenario_distribution()` is a representation-equivalent adapter for
already-explicit integer total scenarios.

For example, these score scenarios:

- primary 2-1
- primary 3-1
- primary 2-2
- upside 3-2

collapse to:

- primary 3
- primary 4
- primary 4
- upside 5

The duplicate four-goal scenarios are retained because Method C weights recorded
**scenarios**, not unique integer totals. The resulting distribution is exactly the same
as the scoreline-based adapter.

This change does **not** generate a forecast. It does not expand a goal band, repeat an
anchor, smooth a tail, or introduce Poisson mass.

## Current evidence boundary

The current evidence fixture separates active support, cross-version history, negative
controls, and the canonical acceptance control.

Clean active v0.2.47-R rows preserve several three-goal anchors:

- Cardiff City–Norwich City
- Monterrey–Chicago Fire
- León–Real Salt Lake
- Ipswich Town–Leicester City

However, only **Cardiff–Norwich** also preserves a numeric projected range: **3-4 goals**
with **3 explicitly described as the central outcome**.

None of the clean active rows preserves explicit primary/upside scenario multiplicity.
Therefore the current mapping status is:

`NON_IDENTIFIABLE_FROM_BAND_ANCHOR_ONLY`

A band and anchor constrain the projection, but do not determine a probability
assignment.

## Two explicit research candidates for 3-4 / central 3

The analyzer can benchmark a candidate only when the caller names the policy. There is
no default policy.

### Candidate A — `BAND_EQUAL_PRIMARY`

Input:

- range: 3-4
- anchor: 3
- primary totals: 3, 4
- upside totals: none

Method C result:

- P(3) = 0.50
- P(4) = 0.50
- projected mean = 3.50
- even-money fair total = 3.50

This interpretation treats the band endpoints equally. It does not give the word
"central" any additional mass.

### Candidate B — `LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE`

Input:

- range: 3-4
- anchor: 3
- primary total: 3
- upside total: 4

Method C uses primary weight 1 and upside weight 1/2 because two total scenarios were
recorded. After normalization:

- P(3) = 2/3
- P(4) = 1/3
- projected mean = 10/3, approximately 3.3333
- even-money fair total = 3.25

This interpretation is semantically attractive because the source says three is central,
but that semantic attraction is **not evidence of a canonical weighting rule**.

## América–Monterrey acceptance control

The canonical acceptance board remains:

- O2.5 @1.69
- O2.75 @1.89
- O3 @2.16
- O3.25 @2.42
- production answer: O2.75 @1.89

The acceptance match is not used to create a distribution. Its recovered evidence does
not contain an explicit 3-4 numeric band.

As a holdout compatibility check only, Candidate B is passed through exact market math
with the active 1.70 minimum price. O2.5 is removed by the price floor, and the remaining
diagnostic expected-P/L ranking places:

1. O2.75 @1.89
2. O3 @2.16
3. O3.25 @2.42

That is encouraging because it does not contradict the acceptance case. It is **not** a
validation of Candidate B and does not turn expected-P/L rank into the final selection
rule. Production still requires structural protection/failure-mode reasoning and the
approved decision chain.

## Historical score templates

Older explicit score templates can now be collapsed to total-goal scenarios without
losing any information relevant to Asian totals. This is useful for reconstruction and
regression tests.

Those rows remain cross-version historical evidence or negative controls. In particular,
a repeated historical 3-4 shape cannot become v0.2.47-R authority merely because its
team identities have been removed.

## Why production remains blocked

The missing item is no longer "which team scores the goals." It is the narrower question:

> Given a structurally recovered total range and central goal anchor, what scenario
> multiplicity/primary-upside assignment did active v0.2.47-R intend?

Current active evidence has one clean band+anchor case and zero clean explicit mappings,
so there is no identifiable canonical answer.

No production code should choose between Candidate A and Candidate B yet.

## Guardrails

- No team scoreline fabrication.
- No Poisson fallback.
- No synthetic tail mass.
- No equal-band assumption unless explicitly selected for research.
- No "central anchor means 2/3 probability" assumption.
- Historical/cross-version evidence cannot activate a rule.
- Negative controls cannot increase support.
- América–Monterrey remains a holdout acceptance control, not fitting evidence.
- Method C remains approved downstream math; this research does not change its authority.
- `MODEL_STATE.json` is unchanged.
- `/verdict` remains disabled.
- Sep-1 hardening remains inactive.

## Next evidence needed

A production proposal would require additional clean active-v0.2.47-R records that
preserve **both** the numeric total band/anchor and an explicit scenario interpretation,
or another independently recoverable rule that identifies scenario multiplicity without
using market prices or final results to back-fit it.

Until then, the correct producer result is `UNRESOLVED`.
