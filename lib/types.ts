export type FocusStatus = "TOP FOCUS" | "STRONG FOCUS" | "SECONDARY" | "HOLD" | "PASS-FIRST";
export type Verdict = "LOCK" | "HOLD" | "PENDING";

export type AsianTotalOffer = {
  line: number;
  odds: number;
};

export type TeamProfile = {
  gf: number;
  ga: number;
  recentGf?: number;
  recentGa?: number;
  scoringTwoPlusRate: number;
  concedingTwoPlusRate: number;
  cleanSheetRate?: number;
  xgFor?: number;
  bigChancesFor?: number;
  sampleCount?: number;
  venueSampleCount?: number;
  xgCoverage?: number;
};

export type MatchRecord = {
  id: string;
  provider: "bsd" | "demo";
  providerEventId?: number;
  kickoff: string;
  competition: string;
  countryCode?: string;
  home: string;
  away: string;
  homeTeamId?: number;
  awayTeamId?: number;
  homeLogoUrl?: string;
  awayLogoUrl?: string;
  focus: FocusStatus;
  preRank: number;
  preScore: number;
  structuralGrade?: "A1" | "A2" | "B+" | "B" | "PASS";
  structuralFamily: string;
  carrier: string;
  secondaryRoute: string;
  failureModeResistance: string;
  failureModes?: string[];
  evidenceSummary: string;
  stage: string;
  homeProfile: TeamProfile;
  awayProfile: TeamProfile;
  lineupStatus: "confirmed" | "predicted" | "unavailable";
  homeXI: string[];
  awayXI: string[];
  homeBench?: string[];
  awayBench?: string[];
  homeFormation?: string;
  awayFormation?: string;
  xiNote: string;
  offers: AsianTotalOffer[];
  verdict: Verdict;
  preferredLine?: number;
  preferredOdds?: number;
  verdictReason: string;
  result?: string;
  pnl?: number;
};
