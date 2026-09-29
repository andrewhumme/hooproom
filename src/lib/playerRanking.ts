// HoopRank — HoopRoom's own data-driven player rating.
//
// Built on the same z-score engine that powers suggested auction values:
// every scoring category is standardized across a qualified player pool, the
// per-category z-scores are summed (turnovers inverted, percentages
// volume-weighted), and players are ordered best → worst by that total.
//
// The rating is league-aware: an 8-cat league ignores turnovers, a points
// league collapses to scoring only, so the same player can rank differently
// in different rooms. Client-safe — no DB access here.

import { computeZTotals, type StatRow } from "@/lib/auctionValues";

export type RankEntry = {
  /** 1 = best available in this league's scoring format. */
  rank: number;
  /** Summed category z-score. ~0 is league-average, 1.0 ≈ one stdev better. */
  z: number;
  /** Per-category z contributions, for tooltips / explanations. */
  breakdown: Partial<Record<string, number>>;
};

export type RankMap = Record<string, RankEntry>;

export function computeHoopRanks(
  stats: StatRow[],
  opts: { scoringFormat: string; poolSize: number },
): RankMap {
  const totals = computeZTotals(stats, opts.scoringFormat, opts.poolSize);
  const out: RankMap = {};
  totals.forEach((t, i) => {
    out[t.player_key] = { rank: i + 1, z: t.z, breakdown: t.breakdown };
  });
  return out;
}

/** Unranked players sort after every ranked one. */
export const UNRANKED = 99999;

const looseKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

export function hoopRankOf(ranks: RankMap, playerId: string): number {
  return ranks[looseKey(playerId)]?.rank ?? UNRANKED;
}

export function hoopZOf(ranks: RankMap, playerId: string): number | null {
  return ranks[looseKey(playerId)]?.z ?? null;
}

/**
 * Sort players best-first: the admin Big Board (`boardRanks`, player id → rank)
 * first, then HoopRank. Rookie-only pools follow real NBA draft order after
 * the board (rookies have no NBA stats, so z-scores are meaningless). Players
 * HoopRank can't rate (no qualifying stats) sort after every rated player,
 * then by NBA draft slot, then name.
 */
export function compareByHoopRank(
  ranks: RankMap,
  rookiePool: boolean,
  boardRanks: Record<string, number> = {},
) {
  return (
    a: { id: string; name: string; draftNumber?: number | null },
    b: { id: string; name: string; draftNumber?: number | null },
  ): number => {
    const ba = boardRanks[a.id] ?? Infinity;
    const bb = boardRanks[b.id] ?? Infinity;
    if (ba !== bb) return ba - bb;
    if (!rookiePool) {
      const ra = hoopRankOf(ranks, a.id);
      const rb = hoopRankOf(ranks, b.id);
      if (ra !== rb) return ra - rb;
    }
    const da = a.draftNumber ?? 9999;
    const db = b.draftNumber ?? 9999;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  };
}
