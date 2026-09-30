// HoopRank — HoopRoom's single player ranking.
//
// Ordered by a current external ranking (Sleeper, imported daily into
// external_player_ranks) for every player it covers — rookies included.
// Anyone it doesn't rank falls in behind, ordered by HoopRoom's stats formula:
// every scoring category is standardized across a qualified player pool, the
// per-category z-scores are summed (turnovers inverted, percentages
// volume-weighted), league-aware (8-cat drops turnovers, points = scoring).
// The admin Big Board overrides both. Client-safe — no DB access here.

import { computeZTotals, type StatRow } from "@/lib/auctionValues";

export type RankEntry = {
  /** 1 = best available in this league's scoring format. */
  rank: number;
  /** Summed category z-score (~0 is league-average); null without stats. */
  z: number | null;
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

/**
 * Final HoopRank: players the external ranking covers, in its order (ties
 * broken by the stats formula), then everyone else by the stats formula.
 * `statRanks` is `computeHoopRanks` output; keys are loose player keys.
 */
export function buildHoopRanks(
  statRanks: RankMap,
  sourceRanks: Array<{ loose_key: string; source_rank: number }>,
): RankMap {
  const source = new Map(sourceRanks.map((r) => [r.loose_key, r.source_rank]));
  const keys = new Set([...Object.keys(statRanks), ...source.keys()]);
  const ordered = [...keys].sort((a, b) => {
    const sa = source.get(a) ?? Infinity;
    const sb = source.get(b) ?? Infinity;
    if (sa !== sb) return sa - sb;
    return (statRanks[a]?.rank ?? Infinity) - (statRanks[b]?.rank ?? Infinity);
  });
  const out: RankMap = {};
  ordered.forEach((key, i) => {
    out[key] = {
      rank: i + 1,
      z: statRanks[key]?.z ?? null,
      breakdown: statRanks[key]?.breakdown ?? {},
    };
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
 * first, then HoopRank. Players HoopRank can't rate sort after every rated
 * player, then by NBA draft slot (so unranked rookies follow draft order),
 * then name.
 */
export function compareByHoopRank(ranks: RankMap, boardRanks: Record<string, number> = {}) {
  return (
    a: { id: string; name: string; draftNumber?: number | null },
    b: { id: string; name: string; draftNumber?: number | null },
  ): number => {
    const ba = boardRanks[a.id] ?? Infinity;
    const bb = boardRanks[b.id] ?? Infinity;
    if (ba !== bb) return ba - bb;
    const ra = hoopRankOf(ranks, a.id);
    const rb = hoopRankOf(ranks, b.id);
    if (ra !== rb) return ra - rb;
    const da = a.draftNumber ?? 9999;
    const db = b.draftNumber ?? 9999;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  };
}
