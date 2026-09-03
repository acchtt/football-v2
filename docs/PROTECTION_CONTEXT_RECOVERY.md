# Protection Context Recovery

Status: **RESEARCH ONLY**  
Active model: **Football v0.2.47-R — PRE-HARDENING**  
Production verdict status: **DISABLED**

This note records the next layer recovered from the historical decision ledger after the central-goal and adjacent protection/price work.

The question is intentionally narrow:

> When two adjacent Asian Over lines are both price-eligible, what historical structural context made one settlement-protection step more or less valuable?

This is **not** a numeric utility model and does not activate a market-selection rule.

## Why a context layer is required

The prior protection-trade recovery falsified a universal price-gain threshold. In clean comparable `half-win -> push` trades around a three-goal anchor:

- Koln–Hoffenheim accepted `O2.75 1.74 -> O3 1.95` for `+0.21`.
- Elversberg–Leverkusen accepted `O2.75 1.74 -> O3 1.96` for `+0.22`.
- Ipswich–Leicester rejected `O2.75 1.75 -> O3 2.00` despite `+0.25`.

A smaller gain was accepted while a larger gain was rejected under the **same settlement transition**. Price alone therefore cannot reproduce the historical choice.

## Evidence normalization

`apps/api/tests/fixtures/protection_context_cases.json` normalizes only context explicitly present in the preserved decision/audit language:

- `structural_family`
- `carrier_dependence`
- `secondary_route_strength`
- `two_sided_strength`
- `suppression_risk`
- `failure_mode_resistance`
- `ceiling_modifier`

The tags are research labels for comparing historical observations. They are not production enums and carry no numeric weights.

Evidence statuses remain separated:

- `supporting_reconstruction`: clean enough to support reconstruction.
- `historical_observation`: useful recurrence, but not positive validation.
- `acceptance_control`: must remain reproducible but is not training evidence.
- `audited_upstream_miss` / `audited_burden_miss`: negative controls only.

The Sep-1 hardening framework remains inactive. Specific audit diagnoses may be retained as negative evidence, but blanket youth/sample/line caps are not restored.

## Clean supporting matrix

Current clean supporting sample: **5 cases**.

### Repeated directional signals

| Context feature | Clean sample | Historical direction |
| --- | ---: | --- |
| `carrier_dependence = low` | 2 | 2/2 accepted higher line |
| `structural_family = TWO_INDEPENDENT_ROUTES` | 2 | 2/2 accepted higher line |
| `failure_mode_resistance = high` | 2 | 2/2 accepted higher line |
| `carrier_dependence = high` | 2 | 2/2 retained lower line |
| `secondary_route_strength = weak` | 2 | 2/2 retained lower line |
| `two_sided_strength = weak` | 2 | 2/2 retained lower line |

These are **directional reconstruction signals**, not model rules. The sample is still small and several fields are correlated with each other.

### Mixed signals

`secondary_route_strength = credible` is not sufficient by itself:

- Koln–Hoffenheim: higher line accepted.
- Elversberg–Leverkusen: higher line accepted.
- Grasshopper–St. Gallen: lower line retained.

That third case matters because the settlement geometry differed: moving from O3.25 to O3.5 changed the three-goal outcome from half-loss to full-loss. Therefore route structure and settlement transition must be considered together.

## Settlement-transition matrix

Within the clean supporting sample:

| Settlement transition at recovered anchor | Higher | Lower | Interpretation |
| --- | ---: | ---: | --- |
| `half_win -> push` | 2 | 1 | Explicitly context-dependent |
| `full_win -> half_win` | 0 | 1 | Sparse; protection retained |
| `half_loss -> full_loss` | 0 | 1 | Sparse; protection retained |

The first row is the key recovery result: even holding the exact settlement transition fixed, context changes the choice.

## América–Monterrey acceptance control

The canonical acceptance case remains isolated from training evidence:

- O2.5 @1.69 is removed by the active 1.70 price floor.
- Compare O2.75 @1.89 with O3 @2.16.
- Recovered anchor: 3 goals.
- Context: América stronger carrier, Monterrey credible second route, but meaningful América suppression/clean-sheet risk.
- Required result: **retain O2.75 @1.89**.

The context fixture labels this as an `acceptance_control`, so it cannot manufacture the signal used to justify itself.

## Negative controls

Aston Villa–Arsenal and Maccabi Tel Aviv–Lugano are retained only as audited upstream misses.

For Aston Villa–Arsenal, the audit explicitly said the Villa secondary route had been promoted from names/absences without adequate underlying chance evidence. For Maccabi–Lugano, the audit said the chase/tempo premise itself failed. Those rows can test whether future policy overgeneralizes, but cannot validate a context rule.

## What the analyzer does

`protection_context_recovery.py`:

1. computes exact settlement transition at the recovered integer goal anchor;
2. separates support, historical recurrence, acceptance controls, and negative controls;
3. summarizes direction by settlement transition;
4. summarizes direction by normalized context feature/value;
5. exposes repeated unanimous associations only as research signals;
6. explicitly reports same-transition cases where a smaller accepted price gain coexists with a larger rejected price gain.

It does **not**:

- assign utility coefficients;
- estimate probabilities;
- create a fair total;
- create fair odds;
- rank live market offers;
- return LOCK/HOLD;
- modify `MODEL_STATE.json`.

## Current conclusion

The historical market behavior is best represented as an interaction:

```text
recovered central goal anchor
+ exact settlement transition
+ route independence / carrier dependence
+ secondary-route strength
+ suppression and failure-mode resistance
+ offered price compensation
        ↓
context-dependent protection trade
```

The evidence is not yet sufficient for a numeric utility function.

The next safe research step is a **shadow categorical policy envelope** with outputs such as `PROTECTION_HEAVY`, `BALANCED`, or `PRICE_TOLERANT`, plus `UNRESOLVED`. It should be calibrated against the golden market cases and acceptance controls without emitting a production line or verdict. Only after that envelope is stable should a model-change proposal be written for explicit approval.
