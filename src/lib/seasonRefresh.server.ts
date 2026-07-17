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

// ---------------------------------------------------------------------------
// Historical backfill — one-time job that populates prior seasons in
// `player_season_stats`. No snapshots (those are for in-season rank tracking).
// Idempotent per (player_key, season). Runs seasons sequentially with a small
// sleep between them to stay polite with nbaapi.com.
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type BackfillSeasonResult = {
  season: number;
  fetched: number;
  upserted: number;
  error?: string;
};

export async function backfillHistoricalSeasons(
  startSeason: number,
  endSeason: number,
): Promise<BackfillSeasonResult[]> {
  const results: BackfillSeasonResult[] = [];
  for (let season = startSeason; season <= endSeason; season++) {
    try {
      const raw = await fetchSeason(season);
      const aggregated = aggregateBySeasonPlayer(raw);
      const rows = aggregated
        .map(toPerGameRow)
        .filter((r): r is NonNullable<typeof r> => r !== null);

      const dedup = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const key = `${r.loose_key}|${r.season}`;
        const existing = dedup.get(key);
        if (!existing || (r.games_played ?? 0) > (existing.games_played ?? 0)) {
          dedup.set(key, r);
        }
      }
      const deduped = [...dedup.values()];

      let upserted = 0;
      const chunkSize = 500;
      for (let i = 0; i < deduped.length; i += chunkSize) {
        const chunk = deduped.slice(i, i + chunkSize).map((r) => {
          const { loose_key: _lk, ...rest } = r;
          return rest;
        });
        const { error } = await supabaseAdmin
          .from("player_season_stats")
          .upsert(chunk, { onConflict: "player_key,season" });
        if (error) throw new Error(error.message);
        upserted += chunk.length;
      }

      results.push({ season, fetched: raw.length, upserted });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ season, fetched: 0, upserted: 0, error: message });
    }
    if (season < endSeason) await sleep(500);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Advanced stats enrichment — pulls TS%, USG%, PIE, AST%, TOV% from the
// public NBA CDN for the current season and patches the matching rows in
// `player_season_stats` (+ mirrors onto today's snapshot when present).
// Joins on nba_player_id (from public.players) with a loose-name fallback.
// ---------------------------------------------------------------------------

type NbaStatsResponse = {
  resultSets: Array<{
    name: string;
    headers: string[];
    rowSet: Array<Array<string | number | null>>;
  }>;
};

function seasonToNbaLabel(season: number) {
  const start = season - 1;
  const end = String(season).slice(-2);
  return `${start}-${end}`;
}

async function fetchNbaAdvanced(season: number) {
  const url = new URL("https://stats.nba.com/stats/leaguedashplayerstats");
  const params: Record<string, string> = {
    MeasureType: "Advanced",
    PerMode: "PerGame",
    PlusMinus: "N",
    PaceAdjust: "N",
    Rank: "N",
    Season: seasonToNbaLabel(season),
    SeasonType: "Regular Season",
    Outcome: "",
    Location: "",
    Month: "0",
    SeasonSegment: "",
    DateFrom: "",
    DateTo: "",
    OpponentTeamID: "0",
    VsConference: "",
    VsDivision: "",
    GameSegment: "",
    Period: "0",
    LastNGames: "0",
    LeagueID: "00",
    TeamID: "0",
    PlayerExperience: "",
    PlayerPosition: "",
    StarterBench: "",
    DraftYear: "",
    DraftPick: "",
    College: "",
    Country: "",
    Height: "",
    Weight: "",
    TwoWay: "0",
    ShotClockRange: "",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Referer: "https://www.nba.com/",
      Origin: "https://www.nba.com",
      "x-nba-stats-origin": "stats",
      "x-nba-stats-token": "true",
    },
  });
  if (!res.ok) throw new Error(`nba.com advanced ${season}: ${res.status}`);
  const json = (await res.json()) as NbaStatsResponse;
  const set = json.resultSets?.[0];
  if (!set) throw new Error("nba.com advanced: empty response");
  const idx = (h: string) => set.headers.indexOf(h);
  const iId = idx("PLAYER_ID");
  const iName = idx("PLAYER_NAME");
  const iTS = idx("TS_PCT");
  const iUSG = idx("USG_PCT");
  const iAST = idx("AST_PCT");
  const iTOV = idx("TM_TOV_PCT");
  const iPIE = idx("PIE");
  return set.rowSet.map((row) => ({
    nba_player_id: (row[iId] as number) ?? null,
    player_name: (row[iName] as string) ?? "",
    ts_pct: row[iTS] as number | null,
    usg_pct: row[iUSG] as number | null,
    ast_pct: row[iAST] as number | null,
    tov_pct: row[iTOV] as number | null,
    pie: row[iPIE] as number | null,
  }));
}

const looseKeyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function refreshAdvancedStats(
  season: number = CURRENT_SEASON,
): Promise<{ season: number; fetched: number; matched: number; updated: number }> {
  const rows = await fetchNbaAdvanced(season);
  if (rows.length === 0) return { season, fetched: 0, matched: 0, updated: 0 };

  const { data: players, error: pErr } = await supabaseAdmin
    .from("players")
    .select("player_key, loose_key, nba_player_id");
  if (pErr) throw new Error(`players lookup: ${pErr.message}`);

  const byNbaId = new Map<number, { player_key: string }>();
  const playersByLoose = new Map<string, { player_key: string }>();
  for (const p of players ?? []) {
    if (p.nba_player_id) byNbaId.set(p.nba_player_id, { player_key: p.player_key });
    if (p.loose_key) playersByLoose.set(p.loose_key, { player_key: p.player_key });
  }

  type Patch = {
    player_key: string;
    ts_pct: number | null;
    usg_pct: number | null;
    ast_pct: number | null;
    tov_pct: number | null;
    pie: number | null;
  };
  const patches: Patch[] = [];
  let matched = 0;
  for (const r of rows) {
    let match: { player_key: string } | undefined;
    if (r.nba_player_id) match = byNbaId.get(r.nba_player_id);
    if (!match && r.player_name) match = playersByLoose.get(looseKeyOf(r.player_name));
    if (!match) continue;
    matched++;
    patches.push({
      player_key: match.player_key,
      ts_pct: r.ts_pct,
      usg_pct: r.usg_pct,
      ast_pct: r.ast_pct,
      tov_pct: r.tov_pct,
      pie: r.pie,
    });
  }

  // Only update existing (player_key, season) rows — the stats table has
  // NOT NULL columns (e.g. `source`) that a partial upsert can't satisfy.
  let updated = 0;
  if (patches.length > 0) {
    const keys = patches.map((p) => p.player_key);
    const { data: existing } = await supabaseAdmin
      .from("player_season_stats")
      .select("player_key")
      .eq("season", season)
      .in("player_key", keys);
    const existingSet = new Set((existing ?? []).map((r) => r.player_key));
    const updatable = patches.filter((p) => existingSet.has(p.player_key));

    const snapshotDate = new Date().toISOString().slice(0, 10);
    for (const p of updatable) {
      const { error } = await supabaseAdmin
        .from("player_season_stats")
        .update({
          ts_pct: p.ts_pct,
          usg_pct: p.usg_pct,
          ast_pct: p.ast_pct,
          tov_pct: p.tov_pct,
          pie: p.pie,
        })
        .eq("player_key", p.player_key)
        .eq("season", season);
      if (error) throw new Error(`advanced update: ${error.message}`);
      updated++;

      // Mirror onto today's snapshot row if it exists (weekly cron).
      await supabaseAdmin
        .from("player_season_snapshots")
        .update({
          ts_pct: p.ts_pct,
          usg_pct: p.usg_pct,
          ast_pct: p.ast_pct,
          tov_pct: p.tov_pct,
          pie: p.pie,
        })
        .eq("player_key", p.player_key)
        .eq("season", season)
        .eq("snapshot_date", snapshotDate);
    }
  }

  return { season, fetched: rows.length, matched, updated };
}
