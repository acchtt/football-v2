import { CURRENT_MODEL_PROMPT } from "@/lib/current-model-prompt";
import type { FocusStatus, MatchRecord } from "@/lib/types";

const OPENAI_BASE_URL = (process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-sol";

export type ModelShortlistItem = {
  id: string;
  status: Extract<FocusStatus, "TOP FOCUS" | "STRONG FOCUS" | "SECONDARY">;
  structuralFamily: string;
  carrier: string;
  secondaryRoute: string;
  failureModeResistance: string;
  reason: string;
};

function apiKey(): string {
  const value = process.env.OPENAI_API_KEY;
  if (!value) throw new Error("OPENAI_API_KEY is not configured");
  return value;
}

export function isModelReasonerConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function configuredReasoningModel(): string {
  return OPENAI_MODEL;
}

function compactProfile(profile: MatchRecord["homeProfile"]): Record<string, number | undefined> {
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

function evidenceFor(match: MatchRecord) {
  return {
    id: match.id,
    kickoff_ict_source: match.kickoff,
    competition: match.competition,
    home: match.home,
    away: match.away,
    home_profile: compactProfile(match.homeProfile),
    away_profile: compactProfile(match.awayProfile),
    mechanical_retrieval_only: {
      score: match.preScore,
      grade: match.structuralGrade,
      family: match.structuralFamily,
      route_summary: match.evidenceSummary,
      failure_modes: match.failureModes || []
    }
  };
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") throw new Error("OpenAI returned an invalid response envelope");
  const root = payload as Record<string, unknown>;
  if (typeof root.output_text === "string" && root.output_text.trim()) return root.output_text;
  if (!Array.isArray(root.output)) throw new Error("OpenAI response contained no output array");

  for (const item of root.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const row = part as Record<string, unknown>;
      if (row.type === "output_text" && typeof row.text === "string") return row.text;
    }
  }
  throw new Error("OpenAI response contained no output text");
}

function validStatus(value: unknown): ModelShortlistItem["status"] | undefined {
  return value === "TOP FOCUS" || value === "STRONG FOCUS" || value === "SECONDARY" ? value : undefined;
}

export async function rankPreSlateWithCurrentModel(matches: MatchRecord[]): Promise<ModelShortlistItem[]> {
  if (!matches.length) return [];

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json"
    },
    cache: "no-store",
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: "high" },
      instructions: CURRENT_MODEL_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Competition eligibility has already been checked. Evaluate this PRE evidence slate. The mechanical fields are retrieval diagnostics only and must not override structural reasoning.\n\n${JSON.stringify(matches.map(evidenceFor))}`
            }
          ]
        }
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "football_pre_shortlist",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              shortlist: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    status: { type: "string", enum: ["TOP FOCUS", "STRONG FOCUS", "SECONDARY"] },
                    structural_family: { type: "string" },
                    carrier: { type: "string" },
                    secondary_route: { type: "string" },
                    failure_mode_resistance: { type: "string" },
                    reason: { type: "string" }
                  },
                  required: [
                    "id",
                    "status",
                    "structural_family",
                    "carrier",
                    "secondary_route",
                    "failure_mode_resistance",
                    "reason"
                  ]
                }
              }
            },
            required: ["shortlist"]
          }
        }
      },
      max_output_tokens: 24000,
      store: false,
      prompt_cache_key: "football-v0.2.47-R-pre-board"
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI PRE ranking failed with ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`);
  }

  const parsed = JSON.parse(extractOutputText(await response.json())) as { shortlist?: unknown[] };
  if (!Array.isArray(parsed.shortlist)) throw new Error("OpenAI PRE ranking returned no shortlist array");

  const validIds = new Set(matches.map((match) => match.id));
  const seen = new Set<string>();
  const shortlist: ModelShortlistItem[] = [];

  for (const raw of parsed.shortlist) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : "";
    const status = validStatus(item.status);
    if (!id || !status || !validIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    shortlist.push({
      id,
      status,
      structuralFamily: String(item.structural_family || "Structural candidate"),
      carrier: String(item.carrier || "Unresolved"),
      secondaryRoute: String(item.secondary_route || "Unresolved"),
      failureModeResistance: String(item.failure_mode_resistance || "Unresolved"),
      reason: String(item.reason || "Current-model PRE shortlist")
    });
  }

  return shortlist;
}
