# Projection template recovery — research only

This document records historical evidence about how older Football model states mapped structural match profiles into qualitative goal bands. It is **not model authority**. Production remains governed only by `/model/MODEL_STATE.json`, and the final LOCK/HOLD route remains disabled until an explicitly approved projection policy exists.

## Research question

The current missing layer is:

```text
PRE structure
+ scoring routes
+ carrier ceiling
+ secondary route
+ failure-mode resistance
+ confirmed XI
+ situation
        ↓
projected 90-minute goal band / score scenarios
        ↓
approved probability distribution
        ↓
exact Asian-total market math
```

The probability-weight sweep showed that the historical score-scenario evidence does not uniquely identify one tail weight. The next useful question is therefore whether the historical ledger repeatedly mapped recognizable structural archetypes into recognizable goal bands.

## Evidence fixture

Recovered explicit-band records are stored in:

```text
apps/api/tests/fixtures/projection_template_cases.json
```

Each row preserves:

- source record ID;
- historical model label;
- structural archetype;
- carrier strength;
- secondary-route quality;
- two-sided strength;
- preserved failure modes and XI effect;
- explicit recovered goal range;
- score scenarios when they were actually recorded;
- evidence status separating supporting reconstruction from historical-only or audited negative controls.

No probability weights, Poisson assumptions, or inferred score probabilities are stored.

## Current recovered patterns

The small sample suggests several recurring shapes:

| Structural shape | Recovered band evidence | Current interpretation |
| --- | --- | --- |
| Low-event, no elite carrier, weak/conditional second route | 1–2 | One supporting historical row; sparse. |
| Standard credible two-sided, no elite independent carrier | 2–3 | Historical mapping evidence, but the preserved case later showed route-classification weakness. |
| Credible carrier with conditional second route | 2–3 | Historical mapping evidence only; realized result exceeded the frozen band. |
| Strong two-sided restored v0.2.47-R profile | 3–4 | One supporting restored-model row; sparse. |
| Elite carrier + credible second route | 3–4 | Repeated historical mapping across two older states, but one row was later audited as a projection/ranking miss. Reconstruction recurrence is real; validation is insufficient. |
| Elite-carrier broad-range forecast with weak secondary route | 2–4 | Explicit failed forecast retained as a negative control. |

These observations support the qualitative idea that stronger independent routes and carrier ceiling tend to shift the projected band upward, while weak secondary routes, suppression, timing uncertainty, and one-route dependence tend to narrow or lower the band. The sample is too small and version-mixed to make that a deterministic production rule.

## Consistency analyzer

Research code:

```text
apps/api/app/football_engine/research/template_recovery.py
apps/api/scripts/analyze_projection_templates.py
```

The analyzer intentionally distinguishes two questions:

1. **Historical mapping consistency** — did older states repeatedly emit the same band for the same broad archetype?
2. **Supporting validation** — do at least two non-negative-control rows support that mapping strongly enough to justify a future proposal?

A historical recurrence does not automatically become validation. Rows tagged as `failed_forecast` or `audited_projection_miss` can reconstruct old behavior but cannot strengthen a future production template.

Current fixture state has no archetype with two clean supporting rows. Therefore the research helper returns no sufficiently-supported template and every result remains:

```text
production_ready = false
blocker = RESEARCH_ONLY_CANONICAL_TEMPLATE_MAPPING_NOT_APPROVED
```

## Important current-model evidence not converted into a band

Current v0.2.47-R PRE-HARDENING records such as Club América–Monterrey preserve useful burden-zone reasoning (A2 Two-Sided / América carrier, suppression keeping the match below A1, protected O2.5/O2.75 zone preferred), but they do not record an explicit numerical goal band. They are deliberately excluded from the explicit-band fixture rather than reverse-engineering a band from the selected market line.

Likewise, post-match hardening-era rules are not imported as current authority. Known process-error records may be used as negative evidence, but they cannot silently revive Sep-1 gates or blanket restrictions.

## What would justify the next model proposal

Before proposing a deterministic structure-to-band mapping, recover more **explicit prematch band rows** from restored v0.2.47/v0.2.47-R decisions, especially repeated examples of:

- strong two-sided profiles;
- elite carrier + credible second route;
- carrier-only / conditional secondary route;
- suppression-heavy A2 profiles;
- XI downgrade cases where the frozen band moved lower.

A proposed mapping should show repeated agreement within an archetype while surviving known negative controls. Only then should a separate explicit approval be requested to activate any template in `/model/MODEL_STATE.json` or production projection code.
