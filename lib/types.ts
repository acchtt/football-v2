export type FocusStatus = "TOP FOCUS" | "STRONG FOCUS" | "SECONDARY" | "HOLD" | "PASS-FIRST";
export type Verdict = "LOCK" | "HOLD" | "PENDING";

export type AsianTotalOffer = {
  line: number;
  odds: number;
};

export type TeamProfile = {
  gf: number;
  ga: number;
  scoringTwoPlusRate: number;
  concedingTwoPlusRate: number;
};

export type MatchRecord = {
  id: string;
  kickoff: string;
  competition: string;
  home: string;
  away: string;
  focus: FocusStatus;
  preRank: number;
  preScore: number;
  structuralFamily: string;
  carrier: string;
  secondaryRoute: string;
  failureModeResistance: string;
  evidenceSummary: string;
  stage: string;
  homeProfile: TeamProfile;
  awayProfile: TeamProfile;
  lineupStatus: "confirmed" | "predicted" | "unavailable";
  homeXI: string[];
  awayXI: string[];
  xiNote: string;
  offers: AsianTotalOffer[];
  verdict: Verdict;
  preferredLine?: number;
  preferredOdds?: number;
  verdictReason: string;
  result?: string;
  pnl?: number;
};
