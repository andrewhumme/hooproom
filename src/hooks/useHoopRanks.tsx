import { useEffect, useState } from "react";
import { getPlayerRanksServer } from "@/lib/playerRanking.functions";
import type { RankMap } from "@/lib/playerRanking";

/**
 * HoopRank for a room — z-score ranking tuned to its scoring format and
 * league shape. Empty until loaded (or when the inputs aren't known yet).
 */
export function useHoopRanks(
  scoringFormat: string | null | undefined,
  teamCount: number | null | undefined,
  rosterSize: number | null | undefined,
): RankMap {
  const [ranks, setRanks] = useState<RankMap>({});

  useEffect(() => {
    if (!scoringFormat || !teamCount || !rosterSize) return;
    let cancelled = false;
    getPlayerRanksServer({ data: { scoringFormat, teamCount, rosterSize } })
      .then((m) => {
        if (!cancelled) setRanks(m);
      })
      .catch((e: unknown) => console.error("hoop ranks failed", e));
    return () => {
      cancelled = true;
    };
  }, [scoringFormat, teamCount, rosterSize]);

  return ranks;
}
