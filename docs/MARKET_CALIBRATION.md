# Market calibration evidence — Football v0.2.47-R PRE-HARDENING

This document is **evidence, not model authority**. It cannot activate or change production rules. The only active-model authority is `/model/MODEL_STATE.json`, and any future structure/XI → projection rule still requires explicit user approval before activation.

## What was recovered

The historical Airtable decision ledger contains multiple v0.2.47-R market boards with the quoted Asian totals, prices, selected line, and contemporaneous rationale. Those records show that the production behavior was not equivalent to the legacy repository shortcut of selecting the lowest acceptable line.

Representative recovered choices are pinned in:

```text
apps/api/tests/fixtures/market_golden_cases.json
```

The set includes the required Club América–Monterrey acceptance case:

```text
O2.5  @ 1.69
O2.75 @ 1.89  <- required production choice
O3.0  @ 2.16
O3.25 @ 2.42
```

## Recovered decision principles

The historical records consistently support these principles:

1. **Structure before price.** Price never creates a route or promotes a structurally weak match.
2. **Goal burden is not minimized mechanically.** The selected line may be above the lowest quoted line when the price improvement justifies the settlement tradeoff.
3. **Settlement protection matters explicitly.** Whole and quarter lines are compared by what happens at the most plausible boundary goal count (full win, half win, push, half loss, full loss).
4. **Price is compensation for surrendered protection, not a standalone trigger.** A price step may be accepted when it improves return without making the key boundary outcome materially worse; it may be rejected when the same step converts a protected outcome into a full loss.
5. **Structural uncertainty changes the acceptable burden.** Suppression, one-route dependence, rotation/cohesion uncertainty, and secondary-route weakness favor stronger protection even when a higher line pays more.
6. **A1 does not mean "take the highest line."** Several A1 cases retained the lower quarter line because exactly three/four goals remained meaningful outcomes.
7. **A2 does not mean "always lowest line."** Several A2/A- cases moved one quarter or half goal upward when price and settlement geometry were favorable.

Examples recovered from the ledger include:

- Thun–Lausanne: O2.75 1.71 / O3 1.92 / O3.25 2.20 -> **O3 1.92**.
- Salzburg–Rapid: O3.25 1.84 / O3.5 2.08 / O3.75 2.33 -> **O3.25 1.84**.
- Austria Wien–WSG: O2.5 1.77 / O2.75 1.99 / O3 2.32 -> **O2.75 1.99** (the later audit criticized the upstream structural promotion, not the quarter-line settlement math).
- Aston Villa–Arsenal: O2.25 1.51 / O2.5 1.72 / O2.75 1.92 / O3 2.20 -> **O2.5 1.72** because suppression risk made full-win protection at exactly three more valuable than the +0.20 price step.
- Liverpool–Nottingham Forest: O2.5 1.54 / O2.75 1.66 / O3 1.86 / O3.25 2.12 -> **O3 1.86**.
- Telstar–Ajax: O3.25 1.74 / O3.5 1.95 / O3.75 2.19 -> **O3.5 1.95**.

## Implemented mathematical layer

`market_math.py` now performs exact distribution-driven Asian-total math without deciding how the goal distribution is created:

- normalize an integer 90-minute goal distribution;
- calculate projected mean goals;
- calculate exact expected P/L for every quoted Over line using the same quarter-line settlement engine as the ledger;
- calculate full-win / half-win / push / half-loss / full-loss probabilities;
- calculate the fair decimal Over price implied by that distribution;
- calculate an even-money fair Asian total as the quarter line whose O2.00 expected P/L is closest to zero;
- rank quoted lines by exact expected P/L for research/diagnostics only.

This layer cannot create an `OFFICIAL LOCK` and has no access to the match state machine or official-bet table.

## Projection reconstruction harness

Historical records also preserve a smaller but useful set of prematch projections expressed as **goal ranges plus score bands**, for example:

- Brentford–Tottenham: expected 2-3 goals; 1-1 / 2-1 / 1-2 with 2-2 upside.
- Hiroshima–Kawasaki: expected 3-4 goals; 2-1 / 3-1 / 2-2 with 3-2 upside.
- Okayama–Tokyo Verdy: expected 1-2 goals; 1-0 / 1-1 / 2-0 with 2-1 upside.
- Kashima–Fukuoka: expected 2-3 goals; 1-0 / 2-0 / 2-1.
- Hull–Manchester United: expected 2-4 goals; 0-2 / 1-2 / 0-3 / 1-3. This case was a failed carrier forecast and is retained deliberately as negative reconstruction evidence.

Those records are pinned in:

```text
apps/api/tests/fixtures/projection_recovery_cases.json
```

The research-only adapter in:

```text
apps/api/app/football_engine/research/projection_reconstruction.py
```

can take caller-supplied weights for the recovered score scenarios, aggregate them into a discrete total-goal distribution, pass that distribution through `market_math.py`, and report how the historical selected offer ranks by exact expected P/L.

Important constraints:

- the ledger did **not** recover canonical scenario probabilities;
- the harness therefore has **no default primary/upside weights**;
- it does not add Poisson tails or smooth unobserved scorelines;
- expected-P/L rank is diagnostic only and is not treated as the historical protection/risk policy;
- production verdict code must not import the research package;
- no candidate weighting scheme may be activated without golden-case testing and explicit approval.

## Remaining canonical gap

The missing production rule is now narrower and explicit:

```text
PRE frozen structure
+ confirmed XI adjustment
+ situational adjustment
        ↓
APPROVED projected 90-minute goal distribution
        ↓
market_math.py
        ↓
protection/risk-aware market comparison policy
        ↓
LOCK / HOLD
```

No Poisson assumption, ad-hoc xG formula, grade-to-goals lookup, or acceptance-case special case has been activated. Any proposed reconstruction must be evaluated against the golden cases and then explicitly approved before it can replace the disabled final verdict route.
