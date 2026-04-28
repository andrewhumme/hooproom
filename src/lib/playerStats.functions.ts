import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { playerKeyFromName } from "@/lib/playerPool";

const BDL_BASE = "https://api.balldontlie.io/v1";
const SEASONS = [2024, 2023, 2022] as const; // last 3 completed/active seasons

type BdlActivePlayer = {
  id: number;
  first_name: string;
  last_name: string;
};

type BdlSeasonAverage = {
  player_id: number;
  season: number;
  games_played: number;
  min: string; // "MM:SS" or numeric string
  pts: number;
  reb: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  turnover: number;
  pf: number;
  fgm: number;
  fga: number;
  fg_pct: number;
  fg3m: number;
  fg3a: number;
  fg3_pct: number;
  ftm: number;
  fta: number;
  ft_pct: number;
};

function bdlHeaders(): HeadersInit {
  const key = process.env.BALLDONTLIE_API_KEY;
  return {
    accept: "application/json",
    ...(key ? { Authorization: key } : {}),
  };
}

function parseMinutes(min: string | number | null): number | null {
  if (min == null) return null;
  if (typeof min === "number") return min;
  if (min.includes(":")) {
    const [m, s] = min.split(":").map(Number);
    return Number((m + (s || 0) / 60).toFixed(2));
  }
  const n = Number(min);
  return Number.isFinite(n) ? n : null;
}

/**
 * Backfill bdl_player_id on public.players by name-matching against
 * balldontlie /players/active. One-time op; safe to re-run.
 */
async function backfillBdlIds(): Promise<{ matched: number; unmatched: number }> {
  // Fetch all active BDL players (paginated)
  const all: BdlActivePlayer[] = [];
  let cursor: number | null = 0;
  let safety = 0;
  while (cursor !== null && safety < 30) {
    const url = new URL(`${BDL_BASE}/players/active`);
    url.searchParams.set("per_page", "100");
    if (cursor) url.searchParams.set("cursor", String(cursor));
    const res = await fetch(url.toString(), { headers: bdlHeaders() });
    if (!res.ok) throw new Error(`BDL active players failed: ${res.status}`);
    const json = (await res.json()) as {
      data: BdlActivePlayer[];
      meta: { next_cursor: number | null };
    };
    all.push(...json.data);
    cursor = json.meta?.next_cursor ?? null;
    safety += 1;
  }

  // Build name → bdl_id map
  const bdlByKey = new Map<number, number>();
  const keyToBdl = new Map<string, number>();
  for (const p of all) {
    const key = playerKeyFromName(`${p.first_name} ${p.last_name}`);
    if (key) keyToBdl.set(key, p.id);
    bdlByKey.set(p.id, p.id);
  }

  // Read our players that still need a bdl id
  const { data: ours, error } = await supabaseAdmin
    .from("players")
    .select("player_key")
    .is("bdl_player_id", null);
  if (error) throw error;

  let matched = 0;
  let unmatched = 0;
  const updates: Array<{ player_key: string; bdl_player_id: number }> = [];
  for (const row of ours ?? []) {
    const bdl = keyToBdl.get(row.player_key);
    if (bdl) {
      updates.push({ player_key: row.player_key, bdl_player_id: bdl });
      matched += 1;
    } else {
      unmatched += 1;
    }
  }

  // Batch update — supabase upsert on player_key (unique)
  // We need to provide required fields, so pull existing rows for these keys.
  if (updates.length > 0) {
    const keys = updates.map((u) => u.player_key);
    const { data: existing } = await supabaseAdmin
      .from("players")
      .select("*")
      .in("player_key", keys);

    const byKey = new Map((existing ?? []).map((r) => [r.player_key, r]));
    const upsertRows = updates
      .map((u) => {
        const e = byKey.get(u.player_key);
        if (!e) return null;
        return { ...e, bdl_player_id: u.bdl_player_id };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Chunk to keep payload small
    for (let i = 0; i < upsertRows.length; i += 200) {
      const chunk = upsertRows.slice(i, i + 200);
      const { error: upErr } = await supabaseAdmin
        .from("players")
        .upsert(chunk, { onConflict: "player_key" });
      if (upErr) throw upErr;
    }
  }

  return { matched, unmatched };
}

/**
 * Fetch season averages from balldontlie for a season.
 * BDL accepts up to 100 player_ids per request.
 */
async function fetchSeasonAverages(
  season: number,
  playerIds: number[],
): Promise<BdlSeasonAverage[]> {
  const out: BdlSeasonAverage[] = [];
  for (let i = 0; i < playerIds.length; i += 100) {
    const chunk = playerIds.slice(i, i + 100);
    const url = new URL(`${BDL_BASE}/season_averages`);
    url.searchParams.set("season", String(season));
    for (const id of chunk) url.searchParams.append("player_ids[]", String(id));

    const res = await fetch(url.toString(), { headers: bdlHeaders() });
    if (!res.ok) {
      // Don't kill the whole seed for one chunk
      console.error(`BDL season_averages ${season} chunk failed:`, res.status);
      continue;
    }
    const json = (await res.json()) as { data: BdlSeasonAverage[] };
    out.push(...(json.data ?? []));
    // Be polite to free tier rate limits
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

/**
 * One-shot: backfill BDL ids + seed last 3 seasons of stats.
 * Safe to re-run; uses upsert on (player_key, season).
 */
export const seedPlayerStatsServer = createServerFn({ method: "POST" }).handler(
  async () => {
    const backfill = await backfillBdlIds();

    const { data: players, error } = await supabaseAdmin
      .from("players")
      .select("player_key, bdl_player_id")
      .not("bdl_player_id", "is", null);
    if (error) throw error;

    const idToKey = new Map<number, string>();
    const ids: number[] = [];
    for (const p of players ?? []) {
      if (p.bdl_player_id != null) {
        idToKey.set(p.bdl_player_id, p.player_key);
        ids.push(p.bdl_player_id);
      }
    }

    let totalRows = 0;
    for (const season of SEASONS) {
      const averages = await fetchSeasonAverages(season, ids);
      const rows = averages
        .map((a) => {
          const player_key = idToKey.get(a.player_id);
          if (!player_key) return null;
          return {
            player_key,
            season: a.season,
            games_played: a.games_played ?? null,
            min: parseMinutes(a.min),
            pts: a.pts ?? null,
            reb: a.reb ?? null,
            oreb: a.oreb ?? null,
            dreb: a.dreb ?? null,
            ast: a.ast ?? null,
            stl: a.stl ?? null,
            blk: a.blk ?? null,
            turnover: a.turnover ?? null,
            pf: a.pf ?? null,
            fgm: a.fgm ?? null,
            fga: a.fga ?? null,
            fg_pct: a.fg_pct ?? null,
            fg3m: a.fg3m ?? null,
            fg3a: a.fg3a ?? null,
            fg3_pct: a.fg3_pct ?? null,
            ftm: a.ftm ?? null,
            fta: a.fta ?? null,
            ft_pct: a.ft_pct ?? null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      // Chunk upserts
      for (let i = 0; i < rows.length; i += 250) {
        const chunk = rows.slice(i, i + 250);
        const { error: upErr } = await supabaseAdmin
          .from("player_season_stats")
          .upsert(chunk, { onConflict: "player_key,season" });
        if (upErr) throw upErr;
        totalRows += chunk.length;
      }
    }

    return {
      backfill,
      seasonsSeeded: SEASONS,
      totalRowsUpserted: totalRows,
    };
  },
);

export type PlayerSeasonStats = {
  season: number;
  games_played: number | null;
  min: number | null;
  pts: number | null;
  reb: number | null;
  oreb: number | null;
  dreb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  turnover: number | null;
  pf: number | null;
  fgm: number | null;
  fga: number | null;
  fg_pct: number | null;
  fg3m: number | null;
  fg3a: number | null;
  fg3_pct: number | null;
  ftm: number | null;
  fta: number | null;
  ft_pct: number | null;
};

/**
 * Fetch all 3 seasons of stats for a single player. Returned newest-first.
 */
export const fetchPlayerStatsServer = createServerFn({ method: "GET" })
  .inputValidator((data: { playerKey: string }) => data)
  .handler(async ({ data }): Promise<PlayerSeasonStats[]> => {
    const { data: rows, error } = await supabaseAdmin
      .from("player_season_stats")
      .select(
        "season, games_played, min, pts, reb, oreb, dreb, ast, stl, blk, turnover, pf, fgm, fga, fg_pct, fg3m, fg3a, fg3_pct, ftm, fta, ft_pct",
      )
      .eq("player_key", data.playerKey)
      .order("season", { ascending: false });
    if (error) throw error;
    return (rows ?? []) as PlayerSeasonStats[];
  });

/**
 * Fetch the most-recent season's headline stats for a batch of players.
 * Used to render inline columns (PTS / REB / AST) in the draft list.
 */
export const fetchLatestStatsForPlayersServer = createServerFn({ method: "POST" })
  .inputValidator((data: { playerKeys: string[] }) => data)
  .handler(async ({ data }) => {
    if (data.playerKeys.length === 0) return {} as Record<string, PlayerSeasonStats>;

    const latestSeason = SEASONS[0];
    const { data: rows, error } = await supabaseAdmin
      .from("player_season_stats")
      .select(
        "player_key, season, games_played, min, pts, reb, ast, stl, blk, fg3m, fg_pct, ft_pct, turnover",
      )
      .in("player_key", data.playerKeys)
      .eq("season", latestSeason);
    if (error) throw error;

    const out: Record<string, Partial<PlayerSeasonStats>> = {};
    for (const r of rows ?? []) {
      out[r.player_key] = r as Partial<PlayerSeasonStats>;
    }
    return out;
  });
