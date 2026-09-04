import { CURRENT_MODEL_PROMPT } from "@/lib/current-model-prompt";
import type { MatchRecord } from "@/lib/types";

export type ManualShortlistItem = {
  id: string;
  status: "TOP FOCUS" | "STRONG FOCUS" | "SECONDARY";
  structural_family: string;
  carrier: string;
  secondary_route: string;
  failure_mode_resistance: string;
  reason: string;
};

function compactProfile(profile: MatchRecord["homeProfile"]) {
  return {
    gf: profile.gf,
    ga: profile.ga,
    recent_gf: profile.recentGf,
    recent_ga: profile.recentGa,
    scoring_2plus_rate: profile.scoringTwoPlusRate,
    conceding_2plus_rate: profile.concedingTwoPlusRate,
    clean_sheet_rate: profile.cleanSheetRate,
    xg_for: profile.xgFor,
    big_chances_for: profile.bigChancesFor,
    sample_count: profile.sampleCount,
    venue_sample_count: profile.venueSampleCount,
    xg_coverage: profile.xgCoverage
  };
}

function preEvidence(match: MatchRecord) {
  return {
    id: match.id,
    kickoff: match.kickoff,
    competition: match.competition,
    home: match.home,
    away: match.away,
    home_profile: compactProfile(match.homeProfile),
    away_profile: compactProfile(match.awayProfile),
    retrieval_diagnostics_only: {
      score: match.preScore,
      grade: match.structuralGrade,
      family: match.structuralFamily,
      route_summary: match.evidenceSummary,
      failure_modes: match.failureModes || []
    }
  };
}

export function buildPreHandoffPacket(date: string, candidates: MatchRecord[]): string {
  return [
    "FOOTBALL v1.0 — MANUAL PRE HANDOFF",
    `Board date: ${date} ICT`,
    "",
    "Paste this entire packet into the Football v1.0 ChatGPT project. Use the project context plus the rules below. Do not treat the retrieval score as the model decision.",
    "",
    CURRENT_MODEL_PROMPT,
    "",
    "RETURN FORMAT",
    "Return JSON only, with no markdown fences or prose outside the JSON:",
    JSON.stringify({
      shortlist: [
        {
          id: "bsd-example",
          status: "TOP FOCUS",
          structural_family: "Two-sided / carrier family",
          carrier: "concise carrier view",
          secondary_route: "concise secondary-route view",
          failure_mode_resistance: "concise resistance view",
          reason: "concise evidence-grounded PRE reason"
        }
      ]
    }, null, 2),
    "",
    "Only TOP FOCUS, STRONG FOCUS, or SECONDARY belong in shortlist. Omit HOLD/PASS-FIRST. There is no quota.",
    "",
    "PRE EVIDENCE",
    JSON.stringify(candidates.map(preEvidence))
  ].join("\n");
}

export function buildMatchDecisionBase(match: MatchRecord): string {
  return [
    "FOOTBALL v1.0 — MANUAL XI + MARKET HANDOFF",
    "Use the Football v1.0 ChatGPT project and the active Football v0.2.47-R PRE-HARDENING model.",
    "Structure before price. Confirmed XI may adjust an existing route but cannot create an unsupported route. BSD odds must not be used. Use only the verified screenshot offers appended to this packet.",
    "Minimum Over price: 1.70. Maximum Over price: 2.30. Sep-1 hardening is inactive. Recent-total/leakage is confirmation only.",
    "If XI is not confirmed or evidence is insufficient, return HOLD.",
    "",
    "MATCH EVIDENCE",
    JSON.stringify({
      ...preEvidence(match),
      lineup_status: match.lineupStatus,
      home_xi: match.homeXI,
      away_xi: match.awayXI,
      home_bench: match.homeBench || [],
      away_bench: match.awayBench || [],
      home_formation: match.homeFormation,
      away_formation: match.awayFormation,
      xi_note: match.xiNote
    }),
    "",
    "RETURN FORMAT",
    "Return JSON only, with no markdown fences or prose outside the JSON:",
    JSON.stringify({
      id: match.id,
      verdict: "LOCK",
      preferred_line: 2.75,
      preferred_odds: 1.89,
      reason: "concise current-model reason"
    }, null, 2),
    "For HOLD, preferred_line and preferred_odds must be null."
  ].join("\n");
}
