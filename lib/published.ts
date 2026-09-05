import state from "@/data/published-matches.json";
import type { PublishedMatch, PublishedState } from "@/lib/types";

export function getPublishedState(): PublishedState {
  return state as PublishedState;
}

export function getPublishedMatches(): PublishedMatch[] {
  return getPublishedState().matches.slice().sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
}

export function getPublishedMatch(slug: string): PublishedMatch | undefined {
  return getPublishedState().matches.find((match) => match.slug === slug);
}
