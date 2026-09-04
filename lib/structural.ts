import { MODEL } from "@/lib/model";
import type { FocusStatus, TeamProfile } from "@/lib/types";

function scaled(value: number | undefined, floor: number, ceiling: number): number | undefined {
  if (value === undefined || ceiling <= floor) return undefined;
  return Math.max(0, Math.min(100, ((value - floor) * 100) / (ceiling - floor)));
}

function weighted(components: Array<[number | undefined, number]>, fallback = 50): number {
  const available = components.filter((item): item is [number, number] => item[0] !== undefined);
  if (!available.length) return fallback;
  const weight = available.reduce((sum, [, itemWeight]) => sum + itemWeight, 0);
  return Number((available.reduce((sum, [value, itemWeight]) => sum + value * itemWeight, 0) / weight).toFixed(2));
}

function routeScore(team: TeamProfile, opponent: TeamProfile): number {
  return weighted([
    [scaled(team.gf, 0.8, 2.4), 0.25],
    [scaled(team.recentGf, 0.8, 2.5), 0.15],
    [scaled(team.scoringTwoPlusRate, 0.2, 0.75), 0.2],
    [scaled(opponent.concedingTwoPlusRate, 0.2, 0.65), 0.15],
    [scaled(team.xgFor, 0.9, 2.2), 0.25]
  ]);
}

function grade(score: number): "A1" | "A2" | "B+" | "B" | "PASS" {
  const thresholds = MODEL.structural.gradeThresholds;
  if (score >= thresholds.A1) return "A1";
  if (score >= thresholds.A2) return "A2";
  if (score >= thresholds["B+"]) return "B+";
  if (score >= thresholds.B) return "B";
  return "PASS";
}

function focusFromGrade(value: ReturnType<typeof grade>): FocusStatus {
  if (value === "A1") return "TOP FOCUS";
  if (value === "A2") return "STRONG FOCUS";
  if (value === "B+") return "SECONDARY";
  if (value === "B") return "HOLD";
  return "PASS-FIRST";
}

export type StructuralAssessment = {
  score: number;
  focus: FocusStatus;
  grade: ReturnType<typeof grade>;
  family: string;
  carrier: string;
  secondaryRoute: string;
  failureModeResistance: string;
  evidenceSummary: string;
  failureModes: string[];
  routeScores: { home: number; away: number };
};

export function assessStructure(home: TeamProfile, away: TeamProfile, homeName: string, awayName: string): StructuralAssessment {
  const mandatoryComplete = [home.gf, home.ga, away.gf, away.ga].every((value) => value !== undefined);
  if (!mandatoryComplete) {
    return {
      score: 0,
      focus: "PASS-FIRST",
      grade: "PASS",
      family: "Profile incomplete",
      carrier: "Pending mandatory GF/GA evidence",
      secondaryRoute: "Pending mandatory GF/GA evidence",
      failureModeResistance: "Unresolved",
      evidenceSummary: "Mandatory GF/GA profile is incomplete; current model forbids promotion.",
      failureModes: ["Missing mandatory GF/GA profile"],
      routeScores: { home: 0, away: 0 }
    };
  }

  const homeRoute = routeScore(home, away);
  const awayRoute = routeScore(away, home);
  const weaker = Math.min(homeRoute, awayRoute);
  const stronger = Math.max(homeRoute, awayRoute);
  const twoSided = Number((weaker * 0.7 + ((homeRoute + awayRoute) / 2) * 0.3).toFixed(2));
  const profileGate = Number(Math.max(twoSided, stronger * 0.85 + weaker * 0.15).toFixed(2));

  const totalXg = home.xgFor !== undefined && away.xgFor !== undefined ? home.xgFor + away.xgFor : undefined;
  const xgQuality = scaled(totalXg, 1.9, 3.8);
  const totalBigChances = home.bigChancesFor !== undefined && away.bigChancesFor !== undefined
    ? home.bigChancesFor + away.bigChancesFor
    : undefined;
  const bigChanceQuality = scaled(totalBigChances, 2, 7);
  const chanceQuality = weighted([[xgQuality, 0.75], [bigChanceQuality, 0.25]], 50);

  const homeCleanSheet = home.cleanSheetRate ?? 0;
  const awayCleanSheet = away.cleanSheetRate ?? 0;
  const homeConceding = home.concedingTwoPlusRate ?? 0;
  const awayConceding = away.concedingTwoPlusRate ?? 0;
  const suppressionResistance = 100 * (1 - Math.min(0.8, (homeCleanSheet + awayCleanSheet) / 2));
  const defensiveOpenness = scaled((homeConceding + awayConceding) / 2, 0.15, 0.55) ?? 0;
  const failureResistance = Number((suppressionResistance * 0.55 + defensiveOpenness * 0.25 + chanceQuality * 0.2).toFixed(2));

  const primaryRoute = Math.max(twoSided, stronger);
  const weights = MODEL.structural.weights;
  const score = Number((
    primaryRoute * weights.primaryRoute +
    profileGate * weights.profile +
    chanceQuality * weights.chanceQuality +
    failureResistance * weights.failureResistance
  ).toFixed(2));

  let family = "Elite carrier";
  if (twoSided >= MODEL.structural.twoSidedRouteThreshold && twoSided >= stronger - MODEL.structural.twoSidedCarrierTolerance) {
    family = "Two-sided";
  } else if (weaker >= MODEL.structural.secondaryRouteThreshold) {
    family = "Carrier + secondary route";
  }

  const carrierTeam = homeRoute >= awayRoute ? homeName : awayName;
  const secondaryTeam = homeRoute >= awayRoute ? awayName : homeName;
  const resistanceLabel = failureResistance >= 70 ? "High" : failureResistance >= 50 ? "Medium" : "Low";
  const failureModes: string[] = [];
  if (weaker < 45) failureModes.push("Weak secondary scoring route");
  if ((homeCleanSheet + awayCleanSheet) / 2 >= 0.35) failureModes.push("High clean-sheet suppression");
  if (chanceQuality < 55) failureModes.push("Chance-quality support is weak");

  const assessedGrade = grade(score);
  return {
    score,
    focus: focusFromGrade(assessedGrade),
    grade: assessedGrade,
    family,
    carrier: `${carrierTeam} route ${stronger.toFixed(0)}/100`,
    secondaryRoute: `${secondaryTeam} route ${weaker.toFixed(0)}/100`,
    failureModeResistance: `${resistanceLabel} · ${failureResistance.toFixed(0)}/100`,
    evidenceSummary: `Routes ${homeName} ${homeRoute.toFixed(0)} / ${awayName} ${awayRoute.toFixed(0)}; profile ${profileGate.toFixed(0)}; chance support ${chanceQuality.toFixed(0)}.`,
    failureModes,
    routeScores: { home: homeRoute, away: awayRoute }
  };
}
