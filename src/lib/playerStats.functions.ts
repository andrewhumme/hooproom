import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CURRENT_SEASON } from "@/lib/seasonRefresh.server";

const SEASONS = [2024, 2025, 2026];

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
      // Current season + the 5 before it — the same window HoopRank uses.
      .gte("season", CURRENT_SEASON - 5)
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
          "loose_key, season, team, games_played, minutes_per_game, pts, reb, ast, stl, blk, tov, fg3_made, fg_pct, fg3_pct, ft_pct, ef_fg_pct, ts_pct, usg_pct, ast_pct, tov_pct, pie",
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
