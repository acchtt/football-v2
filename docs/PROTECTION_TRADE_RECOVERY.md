# Protection vs Price Recovery

Status: **research only / not active**.

This step reconstructs the historical v0.2.47-R decision layer immediately after a central integer goal outcome has been identified. It does not estimate a goal distribution, fair odds, fair total, or issue a production verdict.

## Question

For two adjacent Asian Over lines, when the higher line pays more but gives up settlement protection at the recovered integer goal anchor, what did the historical model do?

Example around a three-goal anchor:

- O2.50: three goals = full win
- O2.75: three goals = half win / half push
- O3.00: three goals = push
- O3.25: three goals = half loss / half push
- O3.50: three goals = full loss

The important object is therefore a **protection trade**, not merely a line or an odds difference.

## Recovered findings

### 1. The active 1.70 floor is a separate first-stage filter

Two clear controls show this directly:

- Cardiff–Norwich: O2.75 @1.67 was below the floor, leaving O3 @1.86 as the eligible central-three expression.
- Club America–Monterrey acceptance: O2.5 @1.69 is below the floor, so O2.75 @1.89 becomes the first eligible protected candidate.

A floor elimination is not evidence that the model prefers a higher burden. The lower line was simply ineligible.

### 2. There is no universal `+X odds` rule for surrendering one protection step

The supporting apples-to-apples sample compares adjacent quarter-lines that:

- are both above the 1.70 floor;
- surrender exactly one settlement step at the recovered integer anchor; and
- are supported by restored-model evidence rather than an acceptance control or an audited upstream error.

Observed supporting trades include:

- Koln–Hoffenheim: O2.75 @1.74 -> O3 @1.95, **move up accepted**, +0.21.
- Elversberg–Leverkusen: O2.75 @1.74 -> O3 @1.96, **move up accepted**, +0.22.
- Ipswich–Leicester: O2.75 @1.75 -> O3 @2.00, **move up rejected**, +0.25.
- Lecce–Roma: O2.5 @1.92 -> O2.75 @2.18, **move up rejected**, +0.26.
- Grasshopper–St. Gallen: O3.25 @1.79 -> O3.5 @1.99, **move up rejected**, +0.20.

A rule of the form `move up if price gain >= threshold` cannot reproduce these observations. A smaller gain was accepted while larger gains were rejected.

This also confirms why the earlier idea of hard-coding a +0.20 or +0.25 step threshold would be historically false.

### 3. Structure/failure-mode context must modify the protection trade

The records repeatedly explain opposite choices with different structural contexts:

- stronger independent two-sided routes can tolerate moving from O2.75 to O3 when the price improves;
- carrier dependence, weak/conditional secondary routes, suppression risk, or scoring uncertainty increase the value of protecting the central outcome;
- high-total cases can move upward without losing anchor settlement at all (for example O3.25 -> O3.5 when four goals still fully win), which is a different trade from surrendering half-win to push.

This is evidence for a **context-dependent policy**, not yet a complete formula.

## America–Monterrey acceptance

The acceptance board is preserved as two distinct controls:

1. `O2.5 @1.69 -> O2.75 @1.89`: lower line removed by the approved 1.70 price floor.
2. `O2.75 @1.89 -> O3 @2.16`: both eligible, but the required production selection remains O2.75. The +0.27 price gain does not justify giving up the half-win at exactly three under the A2 / America-carrier / suppression context.

The acceptance case is never counted as training or supporting reconstruction evidence.

## Negative controls

Maccabi–Lugano and Austria Wien–WSG are retained as negative controls because later audits identified upstream premise/structural problems. Their historical line choices remain useful for reconstructing what happened, but they do not strengthen a future production policy.

Likewise, this document does not reactivate the Sep-1 hardening framework. No youth blanket cap, A2 burden prohibition, O3.75 gate, xG veto, H2H veto, or similar rule is introduced here.

## What remains missing

The recovered chain is now:

```text
structure / routes / XI / situation
        -> goal-band evidence
        -> central integer goal anchor
        -> 1.70 price-floor eligibility
        -> protection-vs-price trade
        -> ??? context-dependent utility / fair-value comparison
        -> LOCK / HOLD
```

The `???` is now narrower. We need to recover or propose how structural confidence and failure-mode resistance modify the value of one settlement-protection step. Until that is approved, the research analyzer always reports `production_ready = false` and production verdict remains disabled.
