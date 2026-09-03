# PROPOSED — recovered shadow market-policy layer

**Status:** PROPOSED / NOT ACTIVE

**Model:** Football v0.2.47-R — PRE-HARDENING

**Runtime authority:** `/model/MODEL_STATE.json`

This proposal summarizes the four-step reconstruction sequence completed after restoration of the 1.70 price floor and removal of the blanket grade-based line cap. It does not change production state without explicit user approval.

## Recovered chain

The research evidence now supports this ordered market-expression chain:

```text
structure + XI + situation
→ recovered central integer goal anchor
→ categorical protection posture
→ minimum-price / maximum-price eligibility
→ exact Asian settlement envelope around the anchor
→ supplied goal distribution
→ exact fair odds / EV / fair total diagnostics
→ final market choice (NOT YET APPROVED)
```

The categorical postures are:

- `PROTECTION_HEAVY`: do not surrender the best available settlement at the recovered central anchor merely for price.
- `BALANCED`: tolerate at most one settlement step away from the best anchor protection before the exact-value layer.
- `PRICE_TOLERANT`: tolerate at most two settlement steps in environments with two independent routes, low carrier dependence, low suppression, and high failure-mode resistance.
- `UNRESOLVED`: no market expression may be promoted from this layer.

These are envelopes, not a final selector.

## Recovered structural direction

Repeated clean evidence supports:

- low carrier dependence + two independent routes + high failure-mode resistance → greater willingness to trade protection for price;
- high carrier dependence + weak/unproven secondary route + suppression risk → greater value assigned to settlement protection;
- a credible secondary route alone is insufficient to justify a more aggressive line;
- price is compensation, not structural promotion;
- no universal `+0.xx` odds threshold can reproduce the historical record.

This restores the v43/v47 ordering: structure first, price later.

## Golden-board shadow validation target

All existing golden market boards have explicit shadow inputs containing an integer anchor and posture. The required regression condition is that the historical selected offer survives the categorical envelope. Known audited process errors remain labeled as negative controls rather than positive training evidence.

The project acceptance case remains:

```text
Club America–Monterrey
O2.5  1.69  -> below active 1.70 floor
O2.75 1.89  -> required surviving protected expression
O3.0  2.16  -> rejected by PROTECTION_HEAVY anchor protection
O3.25 2.42  -> above active maximum price and excessive burden
```

The shadow envelope therefore narrows this board to O2.75 @1.89 without a match-specific code exception.

## Exact Asian math connection

`shadow_decision_chain.py` now composes the recovered context/anchor policy with the existing exact distribution-driven Asian market math. It reports:

- projected mean goals;
- even-money fair total;
- exact fair odds;
- exact expected P/L;
- full-win / half-win / push / half-loss / full-loss mass;
- EV rank inside the surviving categorical envelope.

It deliberately returns `official_selection = None`.

The chain never creates a probability distribution. A supplied distribution is mandatory; missing probability input fails closed.

## Remaining activation blocker

The remaining blocker is narrow but material: the canonical production path still does not have an approved deterministic method that converts the recovered structure / goal-band / score-scenario evidence into one specific probability distribution.

Historical evidence established that simple Poisson / max-EV reconstruction is wrong for cases such as Aston Villa–Arsenal and Telstar–Ajax. Historical score-band evidence also did not identify one unique primary/upside weighting ratio. Therefore no distribution weights have been silently invented.

As a result, this proposal does **not** authorize the public `/verdict` endpoint or an `OFFICIAL_LOCK` transition.

## Proposed activation scope after explicit approval

Approval of this proposal would authorize only the following production concepts:

1. the four categorical protection postures;
2. the recovered categorical context mapping;
3. the categorical settlement envelope as a pre-market filter;
4. the rule that unresolved context fails closed to HOLD;
5. the existing 1.70–2.30 price eligibility range;
6. the requirement that final exact selection still consume an approved goal distribution and exact Asian math.

It would **not** authorize:

- invented scenario weights;
- Poisson projection;
- max-EV-only selection;
- a fixed price-step threshold;
- automatic promotion of O3.75;
- Sep-1 youth/reserve, short-sample, A2-burden or O3.75 hard gates;
- H2H or xG vetoes;
- enabling `/verdict` before the probability layer is approved.

## Required hardening before official verdict activation

Before `/verdict` can be enabled, all of the following must be true:

- canonical distribution-generation method explicitly approved;
- full golden market suite passes with no match-specific branches;
- America–Monterrey acceptance passes exactly at O2.75 @1.89;
- Villa–Arsenal protection behavior remains protected against max-EV drift;
- Telstar–Ajax O3.5 remains possible;
- legitimate O3.75 cases remain possible;
- exact quarter-line settlement tests pass;
- research imports remain absent from production runtime;
- official stage transitions remain append-only and irreversible;
- explicit user approval is recorded before `MODEL_STATE.json` or verdict runtime changes.

## Current recommendation

The categorical market-policy reconstruction is mature enough to freeze as **shadow evidence**. The official verdict engine should remain disabled until the upstream probability-distribution mapping is explicitly approved.
