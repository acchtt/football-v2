import type { BsdLineup, FinalVerdict, PublishedMatch, VerifiedOffer, XiEvaluation, XiRequirement } from "@/lib/types";

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function containsPlayer(list: string[], player: string): boolean {
  const target = normalize(player);
  return list.some((name) => {
    const candidate = normalize(name);
    return candidate === target || candidate.includes(target) || target.includes(candidate);
  });
}

export function evaluateXi(match: PublishedMatch, lineup: BsdLineup): XiEvaluation {
  const requirements = match.xi_policy.requirements.map((rule) => {
    const starters = rule.side === "home" ? lineup.homeStarting : lineup.awayStarting;
    return { ...rule, present: lineup.status === "confirmed" && containsPlayer(starters, rule.player) };
  });
  const missingRequired = requirements.filter((rule): rule is XiRequirement & { present: boolean } => rule.required && !rule.present);
  if (match.xi_policy.require_confirmed && lineup.status !== "confirmed") {
    return { ready: false, status: "WAITING_XI", missingRequired, requirements };
  }
  if (missingRequired.length) return { ready: false, status: "XI_HOLD", missingRequired, requirements };
  return { ready: true, status: "XI_CONFIRMED", missingRequired: [], requirements };
}

export function normalizeOffer(line: number, rawOdds: number): VerifiedOffer | undefined {
  if (!Number.isFinite(line) || !Number.isFinite(rawOdds) || line <= 0 || rawOdds <= 0) return undefined;
  const oddsFormat: VerifiedOffer["oddsFormat"] = rawOdds < 1.2 ? "HK" : "DECIMAL";
  const decimalOdds = oddsFormat === "HK" ? rawOdds + 1 : rawOdds;
  if (decimalOdds <= 1) return undefined;
  return { line, rawOdds, decimalOdds: Number(decimalOdds.toFixed(3)), oddsFormat };
}

type FinalMarketOverride = {
  line: number;
  minOdds: number;
  maxOdds?: number;
  reason: string;
};

const FINAL_MARKET_OVERRIDES: Record<string, FinalMarketOverride[]> = {
  "hoffenheim-dortmund-2026-09-05": [
    {
      line: 3.25,
      minOdds: 1.9,
      maxOdds: 3.5,
      reason: "Final market-stage decision: confirmed XI preserves both scoring routes and O3.25 is approved from 1.90. Exactly three goals is a half-loss; four or more is a full win."
    }
  ]
};

function finalMarketOverride(match: PublishedMatch, offers: VerifiedOffer[]): FinalVerdict | undefined {
  const rules = FINAL_MARKET_OVERRIDES[match.slug];
  if (!rules?.length) return undefined;

  for (const rule of rules) {
    const matching = offers
      .filter((offer) => Math.abs(offer.line - rule.line) < 0.001)
      .filter((offer) => offer.decimalOdds >= rule.minOdds && offer.decimalOdds <= (rule.maxOdds ?? Number.POSITIVE_INFINITY))
      .sort((a, b) => b.decimalOdds - a.decimalOdds);

    const selected = matching[0];
    if (selected) {
      return {
        verdict: "LOCK",
        line: selected.line,
        odds: selected.decimalOdds,
        reason: rule.reason
      };
    }
  }

  return undefined;
}

export function decide(match: PublishedMatch, xi: XiEvaluation, offers: VerifiedOffer[]): FinalVerdict {
  if (xi.status === "WAITING_XI") return { verdict: "WAIT", reason: "Waiting for BSD lineup_status=confirmed." };
  if (xi.status === "XI_HOLD") {
    return { verdict: "HOLD", reason: `Required XI condition failed: ${xi.missingRequired.map((item) => item.player).join(", ")}.` };
  }
  if (!offers.length) return { verdict: "WAIT", reason: "Upload and verify an odds image first." };

  const override = finalMarketOverride(match, offers);
  if (override) return override;

  const eligible = match.market_policy.choices.flatMap((choice) => {
    const matching = offers.filter((offer) => Math.abs(offer.line - choice.line) < 0.001);
    return matching.flatMap((offer) => {
      const floor = Math.max(match.market_policy.min_price, choice.min_odds);
      const ceiling = Math.min(match.market_policy.max_price, choice.max_odds ?? match.market_policy.max_price);
      if (offer.decimalOdds < floor || offer.decimalOdds > ceiling) return [];
      return [{ choice, offer }];
    });
  }).sort((a, b) => a.choice.priority - b.choice.priority || b.offer.decimalOdds - a.offer.decimalOdds);

  const selected = eligible[0];
  if (!selected) {
    const visible = offers
      .slice()
      .sort((a, b) => a.line - b.line)
      .map((offer) => `O${offer.line}@${offer.decimalOdds.toFixed(2)}`)
      .join(", ");
    return {
      verdict: "HOLD",
      reason: `${match.market_policy.note || "No verified offer fits the published line/price policy for this match."}${visible ? ` Verified offers: ${visible}.` : ""}`
    };
  }

  return {
    verdict: "LOCK",
    line: selected.offer.line,
    odds: selected.offer.decimalOdds,
    reason: selected.choice.note || `Published PRE/XI policy is valid and O${selected.offer.line} is the highest-priority verified burden inside the allowed price range.`
  };
}
