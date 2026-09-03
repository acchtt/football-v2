# Central Outcome Recovery

Status: **research only**  
Production model: **Football v0.2.47-R — PRE-HARDENING**  
Production blocker: `RESEARCH_ONLY_CENTRAL_OUTCOME_MAPPING_NOT_APPROVED`

This note reconstructs one narrow layer of historical decision behavior: the integer goal total that a prematch decision treated as a central or settlement-critical outcome.

It does **not** define a fair total, probability distribution, expected value, or production market selector.

## Why recover an integer anchor separately?

The ledger repeatedly shows that the model reasoned around an integer boundary before choosing an Asian line. A three-goal anchor did not mechanically imply one market expression:

- O2.5 fully wins at three;
- O2.75 half-wins / half-pushes at three;
- O3 pushes at three;
- O3.25 half-loses / half-pushes at three.

Therefore:

`central goal anchor != selected Asian line`

This distinction is necessary to prevent the legacy failure mode where the implementation simply chooses the lowest acceptable line.

## Evidence dataset

`apps/api/tests/fixtures/central_outcome_cases.json` stores sourced reconstruction rows. Every row includes:

- structural family and historical grade label;
- integer `anchor_goal`;
- why that integer mattered (`anchor_role`);
- complete observed market offers;
- historical selected line and odds;
- current-scope compatibility;
- evidence status.

Evidence statuses are intentionally separated:

- `supporting_reconstruction`: clean enough to support reconstruction;
- `acceptance_control`: required behavior that constrains implementation but is not independent validation;
- `historical_forecast_only`: useful historical behavior without positive validation weight;
- `audited_structure_miss`: downstream line behavior preserved, but the upstream structure was later found weak;
- `audited_burden_miss`: the historical anchor/line burden itself was later identified as too aggressive.

Historical Sep-1 enforcement observations appear only where a specific old decision was explicitly audited as a miss. They do not reactivate youth/reserve caps, O3.75 hard gates, general short-sample caps, blanket A2 burden rules, or any other hardened framework.

## Current recovered signal

The clean current-scope evidence presently contains:

- four `TWO_SIDED` supporting cases with a **3-goal anchor**;
- one `CARRIER_HYBRID` supporting case with a **3-goal anchor**;
- the Club América–Monterrey acceptance case as a separate **3-goal acceptance boundary**;
- historical/caution/error controls showing why a higher 4-goal anchor cannot be inferred from carrier strength or high recent totals alone.

For clean `TWO_SIDED` support, the recovered anchor is consistent at three goals while the observed selected-line offsets relative to that anchor are both:

- `-0.25` → O2.75 around a three-goal anchor;
- `0.00` → O3 around a three-goal anchor.

That is evidence of a repeated central outcome, **not** evidence for a deterministic line-selection rule.

## Acceptance control

Club América–Monterrey remains the mandatory production acceptance case:

- O2.5 @1.69
- O2.75 @1.89
- O3 @2.16
- O3.25 @2.42
- expected: **O2.75 @1.89**

The acceptance case is deliberately tagged `acceptance_control`, not `supporting_reconstruction`, so the implementation cannot use the required answer as circular evidence for the rule that produces it.

## Analyzer

`app/football_engine/research/central_outcome_recovery.py` reports:

- historical and supporting anchor goals by structural family;
- whether the clean anchor mapping is sparse, consistent, or contradictory;
- selected-line offsets around the anchor;
- whether multiple market expressions occurred around the same anchor;
- how often the historical selection was not the lowest offered line;
- negative-control and acceptance-control counts.

`apps/api/scripts/analyze_central_outcomes.py` prints the report.

Even a group returned by `sufficiently_supported_anchor_groups()` remains research-only and has `production_ready=False`.

## What this step establishes

There is now repeated clean evidence that **three goals functioned as the central settlement anchor for strong/current-scope two-sided decisions** in the restored model family.

It also establishes that the next market decision cannot be reduced to one fixed offset from three. Historical choices around the same anchor include O2.75 and O3, and the canonical América–Monterrey control requires O2.75 despite O2.5 being available.

## What remains unresolved

This recovery still does not answer:

1. how PRE structure is adjusted for confirmed XI and match-specific situational factors;
2. how an anchor becomes a projected goal distribution or fair total;
3. how much probability mass belongs below, at, and above the central integer;
4. how price compensates for moving between O2.5, O2.75, O3, and O3.25;
5. when the correct result is HOLD rather than selecting an adjacent protected line.

Those pieces must be recovered or explicitly approved before the final HTTP LOCK/HOLD engine can be enabled.

## Production boundary

Nothing in `football_engine/research` is authorized to create official decisions. Production code must not import this recovery layer. `MODEL_STATE.json` is unchanged, and the final verdict endpoint remains disabled pending canonical post-XI projection and market-comparison logic.
