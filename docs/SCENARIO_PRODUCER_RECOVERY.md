# Score Scenario Producer Recovery

Status: **RESEARCH / FAIL-CLOSED**  
Active model: **Football v0.2.47-R — PRE-HARDENING**  
Approved distribution method: `RECIPROCAL_TOTAL_SCENARIO_COUNT_V1` (Method C)

## Purpose

Method C is now canonically active, but it deliberately consumes explicit primary/upside score scenarios. The remaining upstream problem is therefore:

```text
structure + XI + situation
→ explicit primary/upside score scenarios
→ Method C distribution
→ fair total
→ protection envelope
→ exact Asian market comparison
```

This recovery step asks whether the historical/current decision record contains enough evidence to build the score-scenario producer without inventing a grade-to-score lookup.

## Main finding

**No score-scenario template is currently production-ready.**

Current restored v0.2.47-R evidence is substantially stronger for:

- structural route class;
- goal band;
- central integer goal anchor;
- settlement protection around that anchor;

than it is for exact home/away scoreline sets.

The clearest current example is Cardiff–Norwich:

```text
current v0.2.47-R
strong two-sided structure
projected band: 3–4
central outcome: 3
preferred protected line: O3
```

But the record does **not** preserve an explicit likely-score set such as `2-1 / 3-1 / 2-2`. Monterrey–Chicago and León–RSL likewise preserve strong current two-sided evidence without an explicit score template.

Therefore a current `TWO_SIDED_STRONG → [specific scores]` rule cannot be recovered honestly from the ledger.

## Historical score templates

Historical model versions do preserve exact score scenarios:

### Standard two-sided 2–3 band

Brentford–Tottenham (`v0.2.51`):

```text
primary: 1-1 / 2-1 / 1-2
upside: 2-2
```

Useful mapping evidence, but the later audit showed the two-sided classification was imperfect and it predates restored v0.2.47-R.

### Elite carrier + secondary 3–4 band

Two historical rows share the same primary score set:

```text
2-1 / 3-1 / 2-2
```

- Hiroshima–Kawasaki (`v0.2.50`) also recorded `3-2` upside, but was later an audited projection miss.
- LAFC–Portland (`v0.2.54`) independently used the same primary set with no explicit upside tail.

This is a real historical recurrence. It is **not** current production authority because one row is a negative control and the other is cross-version historical evidence.

### Other historical mappings

- Okayama–Tokyo Verdy: `1-0 / 1-1 / 2-0`, upside `2-1`.
- Kashima–Avispa: `1-0 / 2-0 / 2-1`.
- Hull–Manchester United: `0-2 / 1-2 / 0-3 / 1-3`, preserved as a failed carrier forecast.

These remain reconstruction evidence only.

## Recovery rule

The research analyzer is intentionally strict.

A structural archetype becomes a **template candidate** only when:

1. at least two clean current-v0.2.47-R supporting rows contain explicit score scenarios;
2. those rows use the same full primary/upside scenario set;
3. no historical or negative row is needed to reach the support threshold.

Negative controls can reveal what the model forecast but can never increase support.
Cross-version historical rows can reveal recurrence but can never silently become current rules.

The analyzer has **no structural-grade input**. A1/A2/B+ is not a scoreline generator.

## Current result

With the present evidence fixture:

```text
production-ready template count = 0
```

`TWO_SIDED_STRONG` has multiple clean current support rows but zero explicit score sets, so it returns:

```text
status = UNRESOLVED
primary_scores = []
upside_scores = []
```

Feeding that unresolved result into Method C fails closed because Method C requires at least one explicit primary scenario.

## Market/runtime boundary

The manual market-verification API now surfaces:

```text
lock_engine_ready = false
blocker = SCORE_SCENARIO_PRODUCER_PENDING
```

This replaces the older generic fair-total blocker and reflects the actual remaining seam.

`MODEL_STATE.json` remains unchanged in this step:

```text
projection.distribution_method = RECIPROCAL_TOTAL_SCENARIO_COUNT_V1
projection.distribution_method_approved = true
projection.upstream_scenario_producer_status = PENDING_IMPLEMENTATION
```

No `/verdict` activation occurs.

## Important simplification for the next step

The Asian market engine ultimately consumes a **distribution of total goals**. Method C aggregates team scorelines by total goals before market evaluation.

That means home/away score identity is mathematically irrelevant to the downstream total-market calculation once structural route evidence has already been handled upstream.

This creates a cleaner next research path:

```text
recovered goal band + central anchor
→ explicit total-goal scenarios
→ Method C-compatible weighting
```

rather than inventing home/away splits such as `2-1` versus `1-2` when the current ledger only tells us that `3` is central and `3–4` is the projected band.

A deterministic **band/anchor → total-goal scenario producer** would be a new model rule and must be benchmarked/proposed before activation. It must not be silently inferred from this document.

## Files

- `apps/api/app/football_engine/research/scenario_producer_recovery.py`
- `apps/api/tests/fixtures/scenario_producer_evidence.json`
- `apps/api/tests/test_scenario_producer_recovery.py`
- `apps/api/scripts/analyze_scenario_producer.py`

## Guardrails

This work does not:

- revive Sep-1 hardening;
- introduce a youth/reserve cap;
- create a grade-to-goals lookup;
- infer scorelines from XI names;
- use Poisson fallback;
- synthesize missing score scenarios;
- change the 1.70 minimum price floor;
- add a static total-line ceiling;
- enable official LOCK/HOLD.
