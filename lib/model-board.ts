import { getMatches as getRetrievalBoard, currentIctDate, type BoardData, type DataMode } from "@/lib/safe-data";
import {
  configuredReasoningModel,
  isModelReasonerConfigured,
  rankPreSlateWithCurrentModel
} from "@/lib/openai-ranker";
import type { MatchRecord } from "@/lib/types";

export { currentIctDate };
export type { DataMode };

export type CurrentModelBoard = BoardData & {
  candidateCount: number;
  modelReady: boolean;
  rankingEngine: string;
  rankingError?: string;
};

type CacheEntry = {
  expiresAt: number;
  data: CurrentModelBoard;
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const memoryCache = new Map<string, CacheEntry>();

function applyShortlist(base: MatchRecord[], shortlist: Awaited<ReturnType<typeof rankPreSlateWithCurrentModel>>): MatchRecord[] {
  const byId = new Map(base.map((match) => [match.id, match]));
  return shortlist.flatMap((item, index): MatchRecord[] => {
    const match = byId.get(item.id);
    if (!match) return [];
    return [{
      ...match,
      preRank: index + 1,
      focus: item.status,
      structuralFamily: item.structuralFamily,
      carrier: item.carrier,
      secondaryRoute: item.secondaryRoute,
      failureModeResistance: item.failureModeResistance,
      evidenceSummary: item.reason,
      stage: match.lineupStatus === "confirmed" ? "XI_CONFIRMED" : "WAITING_XI"
    }];
  });
}

export async function getCurrentModelBoard(targetDateIct = currentIctDate()): Promise<CurrentModelBoard> {
  const retrieval = await getRetrievalBoard(targetDateIct);
  if (retrieval.mode !== "BSD") {
    return {
      ...retrieval,
      candidateCount: retrieval.matches.length,
      modelReady: true,
      rankingEngine: "DEMO CONTROLS"
    };
  }

  const candidateCount = retrieval.matches.length;
  if (!isModelReasonerConfigured()) {
    return {
      ...retrieval,
      matches: [],
      candidateCount,
      modelReady: false,
      rankingEngine: "CURRENT MODEL REASONER NOT CONFIGURED",
      rankingError: "OPENAI_API_KEY is not configured. PRE ranking fails closed; retrieval candidates are not shown as model selections."
    };
  }

  const fingerprint = retrieval.matches.map((match) => `${match.id}:${match.preScore}`).join("|");
  const cacheKey = `${targetDateIct}:${configuredReasoningModel()}:${fingerprint}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const shortlist = await rankPreSlateWithCurrentModel(retrieval.matches);
    const data: CurrentModelBoard = {
      ...retrieval,
      matches: applyShortlist(retrieval.matches, shortlist),
      candidateCount,
      modelReady: true,
      rankingEngine: `${configuredReasoningModel()} · Football v0.2.47-R`
    };
    memoryCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data });
    return data;
  } catch (error) {
    return {
      ...retrieval,
      matches: [],
      candidateCount,
      modelReady: false,
      rankingEngine: `${configuredReasoningModel()} ERROR`,
      rankingError: error instanceof Error ? error.message : "Current-model PRE ranking failed"
    };
  }
}
