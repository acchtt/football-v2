import { NextRequest, NextResponse } from "next/server";

const SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";

const TEAM_ALIASES: Record<string, string> = {
  "hoffenheim": "TSG 1899 Hoffenheim",
  "dordrecht": "FC Dordrecht",
  "young boys": "BSC Young Boys",
  "luzern": "FC Luzern",
  "monchengladbach": "Borussia Monchengladbach",
  "borussia monchengladbach": "Borussia Monchengladbach",
  "elversberg": "SV Elversberg",
  "schalke": "Schalke 04",
  "bayern": "Bayern Munich",
  "hamkam": "Hamarkameratene",
  "leverkusen": "Bayer Leverkusen",
  "union berlin": "Union Berlin"
};

const LEAGUE_COUNTRIES: Record<string, string> = {
  "premier league": "England",
  "english premier league": "England",
  "bundesliga": "Germany",
  "german bundesliga": "Germany",
  "eredivisie": "Netherlands",
  "dutch eredivisie": "Netherlands",
  "eerste divisie": "Netherlands",
  "dutch eerste divisie": "Netherlands",
  "swiss super league": "Switzerland",
  "eliteserien": "Norway",
  "norwegian eliteserien": "Norway",
  "ligue 1": "France",
  "french ligue 1": "France",
  "la liga": "Spain",
  "spanish la liga": "Spain",
  "serie a": "Italy",
  "italian serie a": "Italy",
  "major league soccer": "United States",
  "mls": "United States"
};

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    "\"": "&quot;"
  }[char] || char));
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 3).map((part) => part[0]?.toUpperCase()).join("") || "FC";
}

function fallbackLogo(name: string, kind: "team" | "league") {
  const label = escapeXml(initials(name));
  const ring = kind === "league" ? "#68f0a0" : "#91a79b";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="#12241b"/><circle cx="48" cy="48" r="35" fill="none" stroke="${ring}" stroke-width="5"/><text x="48" y="56" text-anchor="middle" font-family="Arial,sans-serif" font-size="23" font-weight="800" fill="#eef8f2">${label}</text></svg>`;
  return new NextResponse(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
    }
  });
}

function validBadge(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("http")) return undefined;
  try {
    const url = new URL(value);
    if (!url.hostname.endsWith("thesportsdb.com")) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

async function sportsDb(path: string) {
  const response = await fetch(`${SPORTSDB_BASE}/${path}`, {
    next: { revalidate: 86_400 },
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) return undefined;
  return response.json() as Promise<Record<string, unknown>>;
}

async function teamBadge(name: string): Promise<string | undefined> {
  const key = normalize(name);
  const query = TEAM_ALIASES[key] || name;
  const payload = await sportsDb(`searchteams.php?t=${encodeURIComponent(query)}`).catch(() => undefined);
  const teams = payload && Array.isArray(payload.teams) ? payload.teams : [];
  const soccer = teams.filter((team) => team && typeof team === "object" && String((team as Record<string, unknown>).strSport || "").toLowerCase() === "soccer");
  const target = normalize(query);
  const ranked = soccer.slice().sort((a, b) => {
    const an = normalize(String((a as Record<string, unknown>).strTeam || ""));
    const bn = normalize(String((b as Record<string, unknown>).strTeam || ""));
    const as = an === target ? 3 : an.includes(target) || target.includes(an) ? 2 : 0;
    const bs = bn === target ? 3 : bn.includes(target) || target.includes(bn) ? 2 : 0;
    return bs - as;
  });
  const row = ranked[0] as Record<string, unknown> | undefined;
  return row ? validBadge(row.strBadge) : undefined;
}

async function leagueBadge(name: string): Promise<string | undefined> {
  const key = normalize(name);
  const country = LEAGUE_COUNTRIES[key];
  if (!country) return undefined;
  const payload = await sportsDb(`search_all_leagues.php?c=${encodeURIComponent(country)}&s=Soccer`).catch(() => undefined);
  const rows = payload && (Array.isArray(payload.countries) ? payload.countries : Array.isArray(payload.countrys) ? payload.countrys : Array.isArray(payload.leagues) ? payload.leagues : []);
  const candidates = (rows || []) as Record<string, unknown>[];
  const aliases = new Set([key]);
  if (key === "premier league") aliases.add("english premier league");
  if (key === "bundesliga") aliases.add("german bundesliga");
  if (key === "eredivisie") aliases.add("dutch eredivisie");
  if (key === "eerste divisie") aliases.add("dutch eerste divisie");
  if (key === "eliteserien") aliases.add("norwegian eliteserien");
  if (key === "ligue 1") aliases.add("french ligue 1");
  if (key === "la liga") aliases.add("spanish la liga");
  if (key === "serie a") aliases.add("italian serie a");

  const row = candidates.find((candidate) => aliases.has(normalize(String(candidate.strLeague || candidate.name || ""))))
    || candidates.find((candidate) => {
      const candidateName = normalize(String(candidate.strLeague || candidate.name || ""));
      return [...aliases].some((alias) => candidateName.includes(alias) || alias.includes(candidateName));
    });
  return row ? validBadge(row.strBadge) : undefined;
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() || "Football";
  const kind = request.nextUrl.searchParams.get("kind") === "league" ? "league" : "team";

  const badge = kind === "league" ? await leagueBadge(name) : await teamBadge(name);
  if (!badge) return fallbackLogo(name, kind);

  return NextResponse.redirect(badge, {
    headers: {
      "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
    }
  });
}
