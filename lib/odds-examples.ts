import type { AsianTotalOffer } from "@/lib/types";

export type OddsExample = {
  id: string;
  label: string;
  matchLabel: string;
  image: string;
  offers: AsianTotalOffer[];
};

export const ODDS_EXAMPLES: OddsExample[] = [
  {
    id: "america-monterrey",
    label: "Example 1 · América–Monterrey",
    matchLabel: "Club América vs Monterrey",
    image: "/examples/odds-america-monterrey.svg",
    offers: [
      { line: 2.5, odds: 1.69 },
      { line: 2.75, odds: 1.89 },
      { line: 3, odds: 2.16 },
      { line: 3.25, odds: 2.42 }
    ]
  },
  {
    id: "koln-hoffenheim",
    label: "Example 2 · Köln–Hoffenheim",
    matchLabel: "Köln vs Hoffenheim",
    image: "/examples/odds-koln-hoffenheim.svg",
    offers: [
      { line: 2.75, odds: 1.74 },
      { line: 3, odds: 1.95 },
      { line: 3.25, odds: 2.2 }
    ]
  },
  {
    id: "ipswich-leicester",
    label: "Example 3 · Ipswich–Leicester",
    matchLabel: "Ipswich Town vs Leicester City",
    image: "/examples/odds-ipswich-leicester.svg",
    offers: [
      { line: 2.75, odds: 1.75 },
      { line: 3, odds: 2 },
      { line: 3.25, odds: 2.25 }
    ]
  }
];
