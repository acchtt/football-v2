import { getMatches as getRetrievalBoard, currentIctDate, type BoardData, type DataMode } from "@/lib/safe-data";
import { buildPreHandoffPacket } from "@/lib/manual-handoff";
import type { MatchRecord } from "@/lib/types";

export { currentIctDate };
export type { DataMode };

export type CurrentModelBoard = BoardData & {
  candidates: MatchRecord[];
  candidateCount: number;
  handoffPacket: string;
  rankingEngine: string;
};

export async function getCurrentModelBoard(targetDateIct = currentIctDate()): Promise<CurrentModelBoard> {
  const retrieval = await getRetrievalBoard(targetDateIct);
  const candidates = retrieval.matches;

  return {
    ...retrieval,
    // Retrieval candidates are deliberately not returned as authoritative model picks.
    matches: [],
    candidates,
    candidateCount: candidates.length,
    handoffPacket: buildPreHandoffPacket(targetDateIct, candidates),
    rankingEngine: "MANUAL CHATGPT HANDOFF · Football v0.2.47-R"
  };
}
