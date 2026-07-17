import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { playerKeyFromName } from "@/lib/playerPool";

const SEASONS = [2023, 2024, 2025];

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

async function fetchSeason(season: number): Promise<NbaApiPlayerTotal[]> {
  const all: NbaApiPlayerTotal[] = [];
  let page = 1;
  while (true) {
    const url = `https://api.server.nbaapi.com/api/playertotals?season=${season}&pageSize=${PAGE_SIZE}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`nbaapi ${season} p${page}: ${res.status}`);
    const json = (await res.json()) as NbaApiResponse;
    // Regular season only — exclude playoff totals which the API mixes in.
    all.push(...json.data.filter((r) => r.isPlayoff !== true));
    if (page >= json.pagination.pages) break;
    page++;
  }
  return all;
}

/**
 * For traded players, the API returns a combined "2TM"/"3TM"/"4TM" row PLUS
 * one row per team. We keep the combined row when present, otherwise the
 * single team row. Never sum — that would double-count.
 */
const isCombinedTeam = (t: string) => /^\d+TM$/i.test(t) || t === "TOT";

function aggregateBySeasonPlayer(rows: NbaApiPlayerTotal[]) {
  const map = new Map<string, NbaApiPlayerTotal>();
  for (const r of rows) {
    const key = `${r.playerId}|${r.season}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...r });
      continue;
    }
    // Prefer the combined multi-team row; otherwise keep the row with more games.
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

function toRow(p: NbaApiPlayerTotal) {
  const gp = p.games || 0;
  if (gp === 0) return null;
  const fgPct = p.fieldAttempts > 0 ? p.fieldGoals / p.fieldAttempts : null;
  const fg3Pct = p.threeAttempts > 0 ? p.threeFg / p.threeAttempts : null;
  const ftPct = p.ftAttempts > 0 ? p.ft / p.ftAttempts : null;
  const efgPct =
    p.fieldAttempts > 0
      ? (p.fieldGoals + 0.5 * p.threeFg) / p.fieldAttempts
      : null;

  return {
    player_key: playerKeyFromName(p.playerName),
    season: p.season,
    team: p.team,
    games_played: gp,
    games_started: p.gamesStarted,
    minutes_per_game: r2(p.minutesPg / gp, 1),
    pts: r2(p.points / gp),
    reb: r2(p.totalRb / gp),
    ast: r2(p.assists / gp),
    stl: r2(p.steals / gp),
    blk: r2(p.blocks / gp),
    tov: r2(p.turnovers / gp),
    oreb: r2(p.offensiveRb / gp),
    dreb: r2(p.defensiveRb / gp),
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
    source: "nbaapi",
  };
}

export const seedPlayerStatsServer = createServerFn({ method: "POST" }).handler(
  async () => {
    const summary: Record<number, { fetched: number; upserted: number }> = {};

    // Wipe existing rows so stale duplicate-key spellings (e.g. "karl-anthony-towns"
    // vs "karlanthony-towns") and old playoff-inclusive totals don't linger.
    const { error: delErr } = await supabaseAdmin
      .from("player_season_stats")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (delErr) throw new Error(`wipe: ${delErr.message}`);

    for (const season of SEASONS) {
      const raw = await fetchSeason(season);
      const aggregated = aggregateBySeasonPlayer(raw);
      const rows = aggregated.map(toRow).filter((r): r is NonNullable<typeof r> => r !== null);

      // Dedupe by (loose_key, season) — the API can yield two name spellings
      // for the same player; keep the row with the most games.
      const dedup = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const lk = r.player_key.toLowerCase().replace(/[^a-z0-9]/g, "");
        const key = `${lk}|${r.season}`;
        const existing = dedup.get(key);
        if (!existing || (r.games_played ?? 0) > (existing.games_played ?? 0)) {
          dedup.set(key, r);
        }
      }
      const deduped = [...dedup.values()];

      // Chunked upsert
      const chunkSize = 500;
      let upserted = 0;
      for (let i = 0; i < deduped.length; i += chunkSize) {
        const chunk = deduped.slice(i, i + chunkSize);
        const { error } = await supabaseAdmin
          .from("player_season_stats")
          .upsert(chunk, { onConflict: "player_key,season" });
        if (error) throw new Error(`upsert ${season}: ${error.message}`);
        upserted += chunk.length;
      }

      summary[season] = { fetched: raw.length, upserted };
    }

    return { ok: true as const, summary };
  },
);

export type PlayerSeasonStats = {
  season: number;
  team: string | null;
  games_played: number | null;
  minutes_per_game: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  fg3_made: number | null;
  fg_pct: number | null;
  fg3_pct: number | null;
  ft_pct: number | null;
  ef_fg_pct: number | null;
  ts_pct: number | null;
  usg_pct: number | null;
  ast_pct: number | null;
  tov_pct: number | null;
  pie: number | null;
};

const looseKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

export const fetchPlayerStatsServer = createServerFn({ method: "GET" })
  .inputValidator((data: { playerKey: string }) => data)
  .handler(async ({ data }): Promise<PlayerSeasonStats[]> => {
    const { data: rows, error } = await supabaseAdmin
      .from("player_season_stats")
      .select(
        "season, team, games_played, minutes_per_game, pts, reb, ast, stl, blk, tov, fg3_made, fg_pct, fg3_pct, ft_pct, ef_fg_pct, ts_pct, usg_pct, ast_pct, tov_pct, pie",
      )
      .eq("loose_key", looseKey(data.playerKey))
      .order("season", { ascending: false });

    if (error) throw new Error(error.message);
    return (rows ?? []) as PlayerSeasonStats[];
  });

export const fetchPlayerNbaIdServer = createServerFn({ method: "GET" })
  .inputValidator((data: { playerKey: string }) => data)
  .handler(async ({ data }): Promise<number | null> => {
    const targetLooseKey = looseKey(data.playerKey);

    const { data: row } = await supabaseAdmin
      .from("players")
      .select("nba_player_id, player_key, loose_key")
      .or(`player_key.eq.${data.playerKey},loose_key.eq.${targetLooseKey}`)
      .maybeSingle();
    return (row?.nba_player_id as number | null) ?? null;
  });

export const fetchLatestStatsForPlayersServer = createServerFn({ method: "POST" })
  .inputValidator((data: { playerKeys: string[] }) => data)
  .handler(
    async ({ data }): Promise<Record<string, PlayerSeasonStats>> => {
      if (data.playerKeys.length === 0) return {};
      const latest = Math.max(...SEASONS);
      const looseToOriginal = new Map<string, string>();
      for (const k of data.playerKeys) looseToOriginal.set(looseKey(k), k);
      const { data: rows, error } = await supabaseAdmin
        .from("player_season_stats")
        .select(
          "loose_key, season, team, games_played, minutes_per_game, pts, reb, ast, stl, blk, tov, fg3_made, fg_pct, fg3_pct, ft_pct, ef_fg_pct",
        )
        .eq("season", latest)
        .in("loose_key", [...looseToOriginal.keys()]);

      if (error) throw new Error(error.message);
      const out: Record<string, PlayerSeasonStats> = {};
      for (const r of rows ?? []) {
        const { loose_key, ...rest } = r as { loose_key: string } & PlayerSeasonStats;
        const original = looseToOriginal.get(loose_key);
        if (original) out[original] = rest;
      }
      return out;
    },
  );
