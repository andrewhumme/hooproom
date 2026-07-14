// Server-only helper: refresh the current NBA season's per-game averages
// in `player_season_stats` AND stamp a dated row into `player_season_snapshots`
// so we can chart rank movement across the season.
//
// Called by:
//   - src/routes/api/public/hooks/refresh-season-stats.ts (weekly pg_cron)
//   - potential future admin triggers
//
// Uses supabaseAdmin (service role). Never import from client-reachable code
// at module scope — always `await import` this file inside a handler.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { playerKeyFromName } from "@/lib/playerPool";

// The "current" season we refresh weekly. When the league flips to a new
// season, bump this value (or drive it from an env var).
export const CURRENT_SEASON = 2025;

type NbaApiPlayerTotal = {
  playerId: string;
  playerName: string;
  position: string;
  team: string;
  season: number;
  games: number;
  gamesStarted: number;
  minutesPg: number;
  fieldGoals: number;
  fieldAttempts: number;
  fieldPercent: number;
  threeFg: number;
  threeAttempts: number;
  threePercent: number;
  effectFgPercent: number;
  ft: number;
  ftAttempts: number;
  ftPercent: number;
  offensiveRb: number;
  defensiveRb: number;
  totalRb: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
  isPlayoff?: boolean;
};

type NbaApiResponse = {
  data: NbaApiPlayerTotal[];
  pagination: { total: number; page: number; pageSize: number; pages: number };
};

const PAGE_SIZE = 500;

const r2 = (n: number, d = 2) =>
  n == null || isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d;

const isCombinedTeam = (t: string) => /^\d+TM$/i.test(t) || t === "TOT";

async function fetchSeason(season: number): Promise<NbaApiPlayerTotal[]> {
  const all: NbaApiPlayerTotal[] = [];
  let page = 1;
  while (true) {
    const url = `https://api.server.nbaapi.com/api/playertotals?season=${season}&pageSize=${PAGE_SIZE}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`nbaapi ${season} p${page}: ${res.status}`);
    const json = (await res.json()) as NbaApiResponse;
    all.push(...json.data.filter((r) => r.isPlayoff !== true));
    if (page >= json.pagination.pages) break;
    page++;
  }
  return all;
}

function aggregateBySeasonPlayer(rows: NbaApiPlayerTotal[]) {
  const map = new Map<string, NbaApiPlayerTotal>();
  for (const r of rows) {
    const key = `${r.playerId}|${r.season}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...r });
      continue;
    }
    const existingCombined = isCombinedTeam(existing.team);
    const incomingCombined = isCombinedTeam(r.team);
    if (incomingCombined && !existingCombined) {
      map.set(key, { ...r });
    } else if (!incomingCombined && !existingCombined && r.games > existing.games) {
      map.set(key, { ...r });
    }
  }
  return [...map.values()];
}

function toPerGameRow(p: NbaApiPlayerTotal) {
  const gp = p.games || 0;
  if (gp === 0) return null;
  const fgPct = p.fieldAttempts > 0 ? p.fieldGoals / p.fieldAttempts : null;
  const fg3Pct = p.threeAttempts > 0 ? p.threeFg / p.threeAttempts : null;
  const ftPct = p.ftAttempts > 0 ? p.ft / p.ftAttempts : null;
  const efgPct =
    p.fieldAttempts > 0
      ? (p.fieldGoals + 0.5 * p.threeFg) / p.fieldAttempts
      : null;

  const player_key = playerKeyFromName(p.playerName);
  return {
    player_key,
    loose_key: player_key.toLowerCase().replace(/[^a-z0-9]/g, ""),
    season: p.season,
    team: p.team,
    games_played: gp,
    minutes_per_game: r2(p.minutesPg / gp, 1),
    pts: r2(p.points / gp),
    reb: r2(p.totalRb / gp),
    ast: r2(p.assists / gp),
    stl: r2(p.steals / gp),
    blk: r2(p.blocks / gp),
    tov: r2(p.turnovers / gp),
    fg_made: r2(p.fieldGoals / gp),
    fg_att: r2(p.fieldAttempts / gp),
    fg_pct: r2(fgPct ?? 0, 3),
    fg3_made: r2(p.threeFg / gp),
    fg3_att: r2(p.threeAttempts / gp),
    fg3_pct: r2(fg3Pct ?? 0, 3),
    ft_made: r2(p.ft / gp),
    ft_att: r2(p.ftAttempts / gp),
    ft_pct: r2(ftPct ?? 0, 3),
    ef_fg_pct: r2(efgPct ?? 0, 3),
    games_started: p.gamesStarted,
    oreb: r2(p.offensiveRb / gp),
    dreb: r2(p.defensiveRb / gp),
    source: "nbaapi" as const,
  };
}

/**
 * Refresh the current season's per-game stats and stamp a dated snapshot row
 * per player. Idempotent per (loose_key, season, snapshot_date).
 */
export async function refreshCurrentSeason(): Promise<{
  season: number;
  fetched: number;
  upsertedStats: number;
  snapshotDate: string;
  snapshotRows: number;
}> {
  const raw = await fetchSeason(CURRENT_SEASON);
  const aggregated = aggregateBySeasonPlayer(raw);
  const rows = aggregated
    .map(toPerGameRow)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Dedup by (loose_key, season), keeping the row with most games played.
  const dedup = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = `${r.loose_key}|${r.season}`;
    const existing = dedup.get(key);
    if (!existing || (r.games_played ?? 0) > (existing.games_played ?? 0)) {
      dedup.set(key, r);
    }
  }
  const deduped = [...dedup.values()];

  // 1. Upsert into player_season_stats (current-season row per player).
  //    Column set excludes loose_key (generated) — match the seed function.
  const statsChunkSize = 500;
  let upsertedStats = 0;
  for (let i = 0; i < deduped.length; i += statsChunkSize) {
    const chunk = deduped.slice(i, i + statsChunkSize).map((r) => {
      // strip loose_key so we don't fight the generated column
      const { loose_key: _lk, ...rest } = r;
      return rest;
    });
    const { error } = await supabaseAdmin
      .from("player_season_stats")
      .upsert(chunk, { onConflict: "player_key,season" });
    if (error) throw new Error(`stats upsert: ${error.message}`);
    upsertedStats += chunk.length;
  }

  // 2. Insert a dated snapshot row per player for this refresh.
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const snapshotRows = deduped.map((r) => ({
    player_key: r.player_key,
    loose_key: r.loose_key,
    season: r.season,
    snapshot_date: snapshotDate,
    team: r.team,
    games_played: r.games_played,
    minutes_per_game: r.minutes_per_game,
    pts: r.pts,
    reb: r.reb,
    ast: r.ast,
    stl: r.stl,
    blk: r.blk,
    tov: r.tov,
    fg3_made: r.fg3_made,
    fg_pct: r.fg_pct,
    fg3_pct: r.fg3_pct,
    ft_pct: r.ft_pct,
    ef_fg_pct: r.ef_fg_pct,
  }));

  const snapChunkSize = 500;
  for (let i = 0; i < snapshotRows.length; i += snapChunkSize) {
    const chunk = snapshotRows.slice(i, i + snapChunkSize);
    const { error } = await supabaseAdmin
      .from("player_season_snapshots")
      .upsert(chunk, { onConflict: "loose_key,season,snapshot_date" });
    if (error) throw new Error(`snapshot upsert: ${error.message}`);
  }

  return {
    season: CURRENT_SEASON,
    fetched: raw.length,
    upsertedStats,
    snapshotDate,
    snapshotRows: snapshotRows.length,
  };
}
