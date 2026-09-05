import state from "@/data/published-matches.json";
import marketOverrides from "@/data/market-overrides.json";
import type { PublishedMatch, PublishedState } from "@/lib/types";

const overrides = marketOverrides as Record<string, PublishedMatch["market_policy"]>;

function withMarketOverrides(source: PublishedState): PublishedState {
  return {
    ...source,
    matches: source.matches.map((match) => ({
      ...match,
      market_policy: overrides[match.slug] ?? match.market_policy
    }))
  };
}

const publishedState = withMarketOverrides(state as PublishedState);

export function getPublishedState(): PublishedState {
  return publishedState;
}

export function getPublishedMatches(): PublishedMatch[] {
  return getPublishedState().matches.slice().sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
}

export function getPublishedMatch(slug: string): PublishedMatch | undefined {
  return getPublishedState().matches.find((match) => match.slug === slug);
}
