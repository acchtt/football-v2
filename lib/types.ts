export type FocusStatus = "TOP FOCUS" | "STRONG FOCUS" | "SECONDARY";

export type ResearchSource = {
  label: string;
  url: string;
};

export type XiRequirement = {
  side: "home" | "away";
  player: string;
  required: boolean;
  reason: string;
};

export type MarketChoice = {
  line: number;
  min_odds: number;
  max_odds?: number;
  priority: number;
  note?: string;
};

export type PublishedMatch = {
  slug: string;
  kickoff: string;
  competition: string;
  home: string;
  away: string;
  focus: FocusStatus;
  research: {
    summary: string;
    carrier: string;
    secondary_route: string;
    failure_mode_resistance: string;
    recent_confirmation: string;
    sources: ResearchSource[];
  };
  xi_policy: {
    require_confirmed: boolean;
    requirements: XiRequirement[];
  };
  market_policy: {
    min_price: number;
    max_price: number;
    choices: MarketChoice[];
    hold_if_no_choice: boolean;
    note?: string;
  };
};

export type PublishedState = {
  schema: 1;
  model: {
    version: string;
    regime: string;
    timezone: string;
  };
  published_at: string | null;
  matches: PublishedMatch[];
};

export type BsdLineup = {
  status: "confirmed" | "predicted" | "unavailable";
  eventId?: number;
  homeStarting: string[];
  awayStarting: string[];
  homeFormation?: string;
  awayFormation?: string;
};

export type XiEvaluation = {
  ready: boolean;
  status: "WAITING_XI" | "XI_CONFIRMED" | "XI_HOLD";
  missingRequired: XiRequirement[];
  requirements: Array<XiRequirement & { present: boolean }>;
};

export type VerifiedOffer = {
  line: number;
  rawOdds: number;
  decimalOdds: number;
  oddsFormat: "DECIMAL" | "HK";
};

export type FinalVerdict = {
  verdict: "LOCK" | "HOLD" | "WAIT";
  line?: number;
  odds?: number;
  reason: string;
};
