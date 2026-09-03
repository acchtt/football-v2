# Distribution Shadow Benchmark

Status: **RESEARCH ONLY — no production winner**

Active production model remains **Football v0.2.47-R — PRE-HARDENING**. This benchmark does not modify `MODEL_STATE.json`, does not activate a total-goal scenario producer, and does not enable `/verdict`.

## Question

The recovered projection layer currently supports two transparent interpretations of a `3-4` expected-goal band with central anchor `3`:

1. `BAND_EQUAL_PRIMARY`
   - primary totals: `3, 4`
   - Method C distribution: `P(3)=0.50`, `P(4)=0.50`
   - projected mean: `3.50`
   - even-money fair total: `3.50`

2. `LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE`
   - primary total: `3`
   - upside total: `4`
   - Method C distribution: `P(3)=2/3`, `P(4)=1/3`
   - projected mean: `10/3 ≈ 3.3333`
   - even-money fair total: `3.25`

The shadow benchmark asks whether either candidate consistently explains historical v0.2.47-R Asian-total expression better **without fitting the América–Monterrey acceptance case**.

## Evidence discipline

The benchmark contains 16 market-board cases split into:

- 5 clean-support cases;
- 3 caution cases;
- 6 audited-error controls;
- 1 historical-only / current-scope-incompatible case;
- 1 acceptance holdout.

Only **Cardiff City–Norwich City** currently preserves both the numeric `3-4` band and central-three anchor explicitly in a clean active-v0.2.47-R record.

Every other row uses `3-4` as a **shadow assumption** for conditional testing. Those rows do not become evidence that the original record actually contained a `3-4` band.

This distinction is mandatory. The benchmark cannot create upstream evidence by repeatedly applying its own assumption.

## Canonical price range

Market comparisons use the currently active price interval:

- minimum Over price: `1.70`
- maximum Over price: `2.30`

Offers outside that interval are removed before diagnostic EV ranking.

Raw expected-P/L ranking is diagnostic only. Historical v0.2.47-R line choice also used settlement protection, structure, failure modes, and price compensation. A historical line ranking second by raw EV is therefore not automatically a process error.

## Clean-support result

Both candidates reproduce the historical selected line as the highest-EV eligible offer in **4 of 5 clean-support cases**.

Both keep the historical selected offer positive-EV in **5 of 5** clean-support cases.

The shared mismatch is **FC Köln–Hoffenheim**:

- historical choice: `O3 @1.95`
- lower protected alternative: `O2.75 @1.74`

Under `BAND_EQUAL_PRIMARY`:

- O3 selected EV: `+0.475u`
- O2.75 top EV: `+0.555u`
- historical-choice EV gap: `0.080u`

Under `LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE`:

- O3 selected EV: about `+0.3167u`
- O2.75 top EV: about `+0.4933u`
- historical-choice EV gap: about `0.1767u`

Across all five clean-support cases, the mean historical-choice EV gap is:

- equal-band: `0.016u`
- anchor-plus-upside: about `0.03533u`

So the equal-band candidate fits the clean historical price move to O3 somewhat better by raw EV distance.

That is not sufficient for activation because EV ranking is not the complete line-expression policy.

## Audited burden control

The cleanest three-anchor goal-burden error is **Jong AZ–Jong Utrecht**, historical `O3.25 @1.83`.

At exactly three goals, O3.25 half-loses.

Under `BAND_EQUAL_PRIMARY`:

- selected O3.25 diagnostic EV: `+0.165u`
- candidate does **not** flag the audited burden as negative.

Under `LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE`:

- selected O3.25 diagnostic EV: about `-0.0567u`
- candidate **does** flag the audited burden as negative.

The anchor-plus-upside candidate also turns the Grasshopper–St. Gallen O3.25 caution case negative, matching the later description that the burden was aggressive though defensible.

This is useful discrimination, but the sample is too small to promote the candidate. There is only one clear audited three-anchor goal-burden-error control in this benchmark.

## América–Monterrey holdout

The canonical acceptance board remains a true holdout:

- O2.5 `1.69`
- O2.75 `1.89`
- O3 `2.16`
- O3.25 `2.42`
- required production result: **O2.75 @1.89**

After applying the active `1.70-2.30` price interval, **both candidate distributions rank O2.75 @1.89 first**.

Therefore América–Monterrey does **not** distinguish the two candidate mappings.

This corrects an overly strong earlier interpretation that anchor-plus-upside was uniquely supported by the acceptance board. It is compatible, but equal-band is compatible too.

## Critical unresolved issue: the band is not a full distribution

Both candidate mappings assign:

- probability below 3 goals: `0`
- probability above 4 goals: `0`

That is a mechanical consequence of interpreting the recovered `3-4` band as the complete scenario support.

But historical language such as "expected 3-4 goals" does not prove that 2-goal or 5-goal outcomes had literally zero probability.

This is now the main projection blocker.

The current evidence can support:

`structure / XI / situation -> expected band + central anchor`

It does **not** yet identify:

`expected band + central anchor -> complete probability support and mass outside the band`

Inventing downside or upside tails would violate the current recovery discipline. A Poisson fallback is still prohibited.

## Interpretation

The benchmark produces a real tradeoff rather than a winner:

- `BAND_EQUAL_PRIMARY` better matches clean historical line choices by raw EV distance, especially Köln–Hoffenheim.
- `LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE` is more conservative above the central three-goal boundary and better detects the available audited O3.25 overburden control.
- Both pass the América holdout.
- Both unrealistically contain zero mass outside the recovered band if treated as full projections.

Result:

**`DESCRIPTIVE_ONLY_NO_PRODUCTION_WINNER`**

Production blocker remains:

**`TOTAL_GOAL_SCENARIO_PRODUCER_PENDING`**

## What should be recovered next

The next evidence search should target historical records that distinguish an **expected band** from **outside-band risk**, without fitting final scores.

Useful source language includes:

- explicit downside branch such as "main failure mode is 2 or fewer";
- explicit upside branch such as "upside 5" or "5+ remains live";
- primary versus upside scenario labels;
- confidence wording around the lower/upper end of the band;
- protected-line reasoning that explicitly quantifies why the central outcome is more likely than a lower failure branch;
- repeated clean cases where the same band/anchor is paired with different failure-mode severity.

The goal is not to guess tail probabilities. It is to determine whether the historical model preserved enough ordinal or multiplicity information to reconstruct them under Method C.

Until that evidence exists and is explicitly approved, the runtime remains blocked at `TOTAL_GOAL_SCENARIO_PRODUCER_PENDING`.
