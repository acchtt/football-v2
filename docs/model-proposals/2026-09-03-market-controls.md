# APPROVED — v0.2.47-R market-control restoration

**Status:** APPROVED AND ACTIVE ON `v1/automatic-xi-results`

**Approval:** User explicitly approved **A+B** on 2026-09-03.

This document is the change-control evidence for the approved restoration. Runtime authority remains `/model/MODEL_STATE.json`.

## Background

The canonical state was assembled from the repository implementation while restoring Football v0.2.47-R PRE-HARDENING. Subsequent recovery of the historical Airtable decision ledger exposed two market-control mismatches between that canonical file and the actual restored-v47-R operating record.

The discrepancies were proposed first and were activated only after explicit user approval.

## Approved A — restore the normal minimum Over price floor to 1.70

### Previous canonical value

```json
"minimum_price": 1.60
```

### Recovered v0.2.47 / v0.2.47-R evidence

The historical decision ledger repeatedly labels prices below 1.70 as below the normal/current/preferred floor, including both prematch and restored-v0.2.47-R workflows.

Representative records:

- Necaxa–León prematch: O2.25 @1.67 below the **1.70 floor**; O2.5 @1.91 was the lowest eligible Over.
- Pachuca–Puebla prematch: O2.5 @1.68 below the **1.70 floor**; O2.75 @1.83 was the lowest eligible protected Over.
- Minnesota–Atlanta: O2.25 @1.69 below the **current 1.70 floor**.
- Colorado–LAFC: O2.25 @1.67 below the **current 1.70 floor**.
- Würzburger Kickers–Köln under restored v0.2.47-R: O3 @1.69 safest but **below floor**; O3.25 @1.98 became the primary watch.
- FC Seoul–Bucheon under restored v0.2.47-R: O1.75 @1.66 below the preferred floor.

### Acceptance-case relevance

Club América–Monterrey board:

```text
O2.5  @ 1.69
O2.75 @ 1.89
O3.0  @ 2.16
O3.25 @ 2.42
```

At the restored normal floor of 1.70, O2.5 @1.69 is not an eligible execution price. O2.75 @1.89 becomes the first clean protected candidate, consistent with the required production decision without an América-specific exception.

### Active canonical change

```json
"market": {
  "minimum_price": 1.70
}
```

The runtime model-state validator now fails closed if the restored floor drifts away from 1.70 without a corresponding approved code/state change.

---

## Approved B — remove the blanket static grade-based maximum-total ceiling

### Previous canonical behavior

The previous state contained grade-based maximum lines and an A1 extension capped at O3.5, making O3.75 structurally impossible in the helper engine.

### Conflict with restored v0.2.47-R evidence

Historical official v0.2.47-R locks include legitimate protected O3.75 selections, including:

- Jong PSV–Jong Ajax — O3.75 @1.79.
- Shanghai Shenhua–Shandong Taishan — O3.75 @1.70.
- Bolívar–ABB — O3.75 @1.77.

These records explicitly reason about settlement protection at exactly four goals and do not describe O3.75 as categorically forbidden.

The canonical handoff also prohibits silently adding an **O3.75 hard gate** or blanket A2 burden prohibition.

### Active canonical change

The grade-based maximum-line map and A1 extension have been removed from active state and replaced with:

```json
"grade_based_maximum_line_enabled": false
```

High lines are therefore not rejected by a blanket grade-only ceiling. They still require the approved decision chain:

1. structure and scoring routes;
2. XI adjustment;
3. situational adjustment;
4. projected goal distribution / fair total;
5. exact settlement burden;
6. verified price comparison.

This does **not** make O3.75 automatically acceptable. It removes a historically inconsistent veto.

---

## What this approval does not activate

This approval does **not** define or activate:

- a Poisson projection;
- a grade-to-goals lookup;
- a fixed price-step threshold;
- an O3.75 promotion rule;
- a youth/reserve cap;
- a short-sample cap;
- an xG hard gate;
- an H2H veto;
- a final LOCK/HOLD formula.

The final verdict endpoint remains disabled until the canonical post-XI projection and market-comparison chain is restored or explicitly approved.

## Completed activation sequence

```text
RECOVERED EVIDENCE
→ PROPOSED CHANGE
→ EXPLICIT USER APPROVAL (A+B)
→ MODEL_STATE.json CHANGE
→ versioned branch commits
→ regression/golden-case updates
```

Production merge still requires the normal validation gate and explicit merge action.
