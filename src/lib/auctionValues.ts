// Pure z-score auction value calculator. Client-safe (no DB access).
// Given per-game season stats for a pool of players + a league shape,
// returns a Map<player_key, suggestedDollars>.

export type StatRow = {
  player_key: string;
  games_played: number | null;
  minutes_per_game: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  fg_made: number | null;
  fg_att: number | null;
  fg_pct: number | null;
  fg3_made: number | null;
  ft_made: number | null;
  ft_att: number | null;
  ft_pct: number | null;
};

export type LeagueShape = {
  teamCount: number;
  rosterSize: number;
  budget: number;
  scoringFormat: string; // e.g. "9-CAT", "8-CAT", "PTS"
};

type CatKey =
  | "pts"
  | "reb"
  | "ast"
  | "stl"
  | "blk"
  | "fg3m"
  | "fg_pct"
  | "ft_pct"
  | "tov";

function categoriesFor(format: string): CatKey[] {
  const f = (format || "").toUpperCase();
  if (f.includes("8")) {
    return ["pts", "reb", "ast", "stl", "blk", "fg3m", "fg_pct", "ft_pct"];
  }
  if (f.startsWith("PTS") || f === "POINTS") {
    // simple points format — value purely on pts contribution
    return ["pts"];
  }
  // default 9-CAT
  return ["pts", "reb", "ast", "stl", "blk", "fg3m", "fg_pct", "ft_pct", "tov"];
}

const TOV_CAT: CatKey = "tov";

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
function stdev(xs: number[], mu: number): number {
  if (xs.length === 0) return 1;
  let s = 0;
  for (const x of xs) s += (x - mu) ** 2;
  const v = s / xs.length;
  return v > 1e-9 ? Math.sqrt(v) : 1;
}

function getRaw(p: StatRow, cat: CatKey): number {
  switch (cat) {
    case "pts":
      return p.pts ?? 0;
    case "reb":
      return p.reb ?? 0;
    case "ast":
      return p.ast ?? 0;
    case "stl":
      return p.stl ?? 0;
    case "blk":
      return p.blk ?? 0;
    case "tov":
      return p.tov ?? 0;
    case "fg3m":
      return p.fg3_made ?? 0;
    case "fg_pct":
      return p.fg_pct ?? 0;
    case "ft_pct":
      return p.ft_pct ?? 0;
  }
}

function getVolume(p: StatRow, cat: CatKey): number {
  if (cat === "fg_pct") return p.fg_att ?? 0;
  if (cat === "ft_pct") return p.ft_att ?? 0;
  return 1;
}

export type ValueRow = {
  player_key: string;
  z: number;
  dollars: number;
  breakdown: Partial<Record<CatKey, number>>;
};

export type ZRow = {
  player_key: string;
  z: number;
  breakdown: Partial<Record<CatKey, number>>;
};

/**
 * Core z-score engine. Standardizes each scoring category across a qualified
 * player pool and sums the per-category z-scores into a single rating.
 * Percentage categories are volume-weighted (impact = (pct - leagueAvg) * attempts)
 * so a 90% FT shooter on 1 attempt/game doesn't outrank a high-volume star.
 * Turnovers are inverted (fewer is better). Returns rows sorted best → worst.
 */
export function computeZTotals(
  stats: StatRow[],
  scoringFormat: string,
  poolSize: number,
): ZRow[] {
  if (stats.length === 0) return [];
  const cats = categoriesFor(scoringFormat);

  // Filter to qualified players: at least 20 games OR 12+ mpg.
  // Keeps the z-score baseline meaningful.
  const qualified = stats.filter(
    (s) => (s.games_played ?? 0) >= 20 || (s.minutes_per_game ?? 0) >= 12,
  );
  if (qualified.length === 0) return [];

  // Take the top players by minutes as the value pool — bench fillers shouldn't
  // skew league means upward, but we need enough depth for replacement level.
  const pool = qualified
    .slice()
    .sort((a, b) => (b.minutes_per_game ?? 0) - (a.minutes_per_game ?? 0))
    .slice(0, Math.min(qualified.length, Math.max(poolSize, 200)));

  // Compute per-cat impact (volume-weighted for percentages).
  const catImpacts = {} as Record<CatKey, number[]>;
  for (const cat of cats) {
    const isPct = cat === "fg_pct" || cat === "ft_pct";
    if (isPct) {
      const leagueAvgPct = mean(pool.map((p) => getRaw(p, cat)));
      catImpacts[cat] = pool.map(
        (p) => (getRaw(p, cat) - leagueAvgPct) * getVolume(p, cat),
      );
    } else {
      catImpacts[cat] = pool.map((p) => getRaw(p, cat));
    }
  }

  // Standardize each cat across pool.
  const zPerCat = {} as Record<CatKey, number[]>;
  for (const cat of cats) {
    const xs = catImpacts[cat];
    const mu = mean(xs);
    const sd = stdev(xs, mu);
    zPerCat[cat] = xs.map((x) => (x - mu) / sd);
  }

  // Total Z per player (TOV inverted).
  const totals: ZRow[] = pool.map((p, i) => {
    let z = 0;
    const breakdown: Partial<Record<CatKey, number>> = {};
    for (const cat of cats) {
      const v = zPerCat[cat][i];
      const signed = cat === TOV_CAT ? -v : v;
      breakdown[cat] = signed;
      z += signed;
    }
    return { player_key: p.player_key, z, breakdown };
  });

  totals.sort((a, b) => b.z - a.z);
  return totals;
}

export function computeAuctionValues(
  stats: StatRow[],
  league: LeagueShape,
): Map<string, ValueRow> {
  const out = new Map<string, ValueRow>();
  const N = league.teamCount * league.rosterSize; // draftable pool size
  const totals = computeZTotals(stats, league.scoringFormat, N * 3);
  if (totals.length === 0) return out;


  // Dollar mapping: $1 baseline for everyone in the top N draftable;
  // distribute surplus money proportional to (z - z_replacement) above 0.
  totals.sort((a, b) => b.z - a.z);
  const drafted = totals.slice(0, N);
  const replacementZ = drafted.length > 0 ? drafted[drafted.length - 1].z : 0;

  const totalMoney = league.teamCount * league.budget;
  const reserved = N * 1; // $1 per slot
  const surplusPool = Math.max(0, totalMoney - reserved);

  const surpluses = drafted.map((d) => Math.max(0, d.z - replacementZ));
  const surplusSum = surpluses.reduce((a, b) => a + b, 0) || 1;

  drafted.forEach((d, i) => {
    const dollars = Math.max(
      1,
      Math.round(1 + (surpluses[i] / surplusSum) * surplusPool),
    );
    out.set(d.player_key, {
      player_key: d.player_key,
      z: d.z,
      dollars,
      breakdown: d.breakdown,
    });
  });

  // Below-replacement players get $1 (or omitted — treat absence as $1).
  for (const t of totals.slice(N)) {
    out.set(t.player_key, {
      player_key: t.player_key,
      z: t.z,
      dollars: 1,
      breakdown: t.breakdown,
    });
  }

  return out;
}
