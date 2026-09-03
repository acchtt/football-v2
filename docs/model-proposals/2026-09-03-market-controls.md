# PROPOSED — v0.2.47-R market-control restoration

**Status:** PROPOSED / NOT ACTIVE

This document is evidence for change control. It is not model authority and does not modify `/model/MODEL_STATE.json`.

## Background

The current canonical state was assembled from the repository implementation while restoring Football v0.2.47-R PRE-HARDENING. Subsequent recovery of the historical Airtable decision ledger exposed two market-control mismatches between that canonical file and the actual restored-v47-R operating record.

The active model must not be changed silently. These discrepancies therefore remain proposals until the user explicitly approves them.

## Proposal A — restore the normal minimum Over price floor to 1.70

### Current canonical value

```json
"minimum_price": 1.60
```

### Recovered v0.2.47 / v0.2.47-R evidence

The historical decision ledger repeatedly labels prices below 1.70 as below the normal/current/preferred floor, including both prematch and restored-v0.2.47-R workflows.

Representative records:

- Necaxa–León prematch: O2.25 @1.67 described as below the **1.70 floor**; O2.5 @1.91 was the lowest eligible Over.
- Pachuca–Puebla prematch: O2.5 @1.68 described as below the **1.70 floor**; O2.75 @1.83 was the lowest eligible protected Over.
- Minnesota–Atlanta: O2.25 @1.69 described as below the **current 1.70 floor**.
- Colorado–LAFC: O2.25 @1.67 described as below the **current 1.70 floor**.
- Würzburger Kickers–Köln under restored v0.2.47-R: O3 @1.69 described as safest but **below floor**; O3.25 @1.98 became the primary watch.
- FC Seoul–Bucheon under restored v0.2.47-R: O1.75 @1.66 described as below the preferred floor.

### Acceptance-case relevance

Club América–Monterrey board:

```text
O2.5  @ 1.69
O2.75 @ 1.89
O3.0  @ 2.16
O3.25 @ 2.42
```

At a restored normal floor of 1.70, O2.5 @1.69 is not an eligible execution price. O2.75 @1.89 becomes the first clean protected candidate, which is consistent with the required production decision without introducing an América-specific exception.

### Caveat

Some later retrospective auto-lock audit rows counted selections priced below 1.70 (for example a Newcastle O3 @1.66 candidate) even though contemporaneous records described compressed prices as below the normal floor or as HOLD. Those rows appear to reflect workflow/audit reconciliation rather than a clean statement that the floor had been removed.

### Proposed canonical change

```json
"market": {
  "minimum_price": 1.70
}
```

Do not activate until explicitly approved.

---

## Proposal B — remove the blanket static A1/A2 line ceiling from production market eligibility

### Current canonical behavior

The current state contains:

```json
"maximum_line_by_grade": {
  "A1": 3.0,
  "A2": 3.0,
  "B+": 2.75,
  "B": 2.5,
  "PASS": 2.5
},
"a1_extended_line": {
  "enabled": true,
  "maximum_line": 3.5
}
```

This makes O3.75 structurally impossible under the current engine.

### Conflict with restored v0.2.47-R evidence

Historical official v0.2.47-R locks include legitimate protected O3.75 selections, for example:

- Jong PSV–Jong Ajax — O3.75 @1.79.
- Shanghai Shenhua–Shandong Taishan — O3.75 @1.70.
- Bolívar–ABB — O3.75 @1.77.

These records explicitly reason about settlement protection at exactly four goals and do not describe O3.75 as categorically forbidden.

The user’s canonical handoff also explicitly prohibits silently adding an **O3.75 hard gate** or blanket A2 burden prohibition.

### Proposed rule direction

Remove a blanket grade-only hard ceiling as a production veto. High lines should instead be evaluated after structure/XI through:

1. carrier/two-sided scoring ceiling;
2. secondary-route quality where relevant;
3. failure-mode resistance;
4. exact settlement burden at plausible boundary goal counts;
5. price as compensation for surrendered protection.

This proposal does **not** mean O3.75 is normally acceptable and does not create an automatic high-line lane. It only removes a rule that contradicts historical pre-hardening behavior.

### Implementation option after approval

Preferred implementation is to replace `maximum_line_by_grade` as an eligibility veto with a non-binding diagnostic/reference burden and let the approved distribution/risk comparison decide whether the quoted line clears. If a temporary safety ceiling is required during reconstruction, it must be explicitly approved and must not be presented as restored historical behavior.

Do not activate until explicitly approved.

---

## What is not being proposed here

This document does **not** define or activate:

- a Poisson projection;
- a grade-to-goals lookup;
- a fixed +0.20 / +0.25 price-step threshold;
- an O3.75 promotion rule;
- a youth/reserve cap;
- a short-sample cap;
- an xG hard gate;
- an H2H veto;
- a final LOCK/HOLD formula.

The historical ledger shows that identical price steps could be accepted in one structural context and rejected in another, so a fixed price-step rule would be an invented simplification.

## Required approval gate

Activation sequence remains:

```text
RECOVERED EVIDENCE
→ PROPOSED CHANGE (this document)
→ EXPLICIT USER APPROVAL
→ MODEL_STATE.json CHANGE
→ versioned commit
→ tests / golden-case validation
→ production activation
```

Until approval, the existing final verdict endpoint remains disabled and verified markets stop at `MARKET_RECEIVED`.
