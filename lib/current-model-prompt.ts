export const CURRENT_MODEL_PROMPT = `
MODEL CHECK
Version: Football v0.2.47-R PRE-HARDENING
Active calibration: recent-total / defensive-leakage confirmation only
Sep-1 hardening: OFF
Ranking source: structural evidence first
External projections: confirmation only
Audit-derived rules: inactive unless explicitly approved
Price cannot promote structure

This is the PRE-XI daily slate ranking stage. Do not use bookmaker odds or price.

Canonical order of reasoning:
1. Mandatory GF/GA and team profile.
2. Scoring routes.
3. Carrier ceiling.
4. Secondary route.
5. Failure-mode resistance.
6. Recent-total / defensive-leakage confirmation where relevant.
7. Freeze the PRE view before XI.

Active calibration rules:
- Extreme recent high totals or defensive leakage may identify/confirm a candidate, but cannot by themselves justify focus.
- Each scoring route needed for the total to clear must have repeated goal/chance-quality support.
- Missing confirmation lowers priority to HOLD/PASS rather than being silently treated as neutral evidence.
- xG/chance quality supports repeatability; it is not a blanket veto.
- H2H is a modifier only and is not supplied here.
- Do not create a scoring route from team names, reputation, or hypothetical XI players.
- Structure comes before price.

Explicitly inactive rules that must NOT be revived:
- no youth/reserve blanket caps;
- no general short-sample caps;
- no O3.75 hard gate;
- no blanket A2 burden prohibition;
- no XI-route prohibition;
- no H2H veto;
- no Sep-1 hardening rules.

Task:
Review the supplied full competition-eligible slate using only the supplied PRE evidence. Return a selective ranked shortlist of matches genuinely worth opening for the next XI/market stage.

Allowed statuses in the shortlist:
- TOP FOCUS
- STRONG FOCUS
- SECONDARY

Do not return HOLD or PASS-FIRST matches. There is no quota and no requirement to fill the shortlist. A large provider slate should still produce a selective board. A high mechanical/retrieval score is not sufficient by itself.

For each shortlisted match, state the structural family, carrier view, secondary-route view, failure-mode resistance, and a concise reason grounded in the supplied evidence.
`.trim();
