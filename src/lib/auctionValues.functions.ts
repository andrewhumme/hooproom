import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  computeAuctionValues,
  computeAvailability,
  type LeagueShape,
  type StatRow,
} from "@/lib/auctionValues";

const LATEST_SEASON = 2026;

/**
 * Compute z-score-based suggested auction values for the given league shape.
 * Returns a Record<player_key, dollars>. Players below replacement level get $1.
 */
export const getAuctionValuesServer = createServerFn({ method: "POST" })
  .inputValidator((data: LeagueShape) => data)
  .handler(async ({ data }): Promise<Record<string, number>> => {
    const { data: rows, error } = await supabaseAdmin
      .from("player_season_stats")
      .select(
        "player_key, loose_key, games_played, minutes_per_game, pts, reb, ast, stl, blk, tov, fg_made, fg_att, fg_pct, fg3_made, ft_made, ft_att, ft_pct",
      )
      .eq("season", LATEST_SEASON);
    if (error) throw new Error(error.message);

    const { data: history, error: histErr } = await supabaseAdmin
      .from("player_season_stats")
      .select("player_key, loose_key, season, games_played")
      .gte("season", LATEST_SEASON - 2);
    if (histErr) throw new Error(histErr.message);

    const byKey = new Map<string, { season: number; games_played: number | null }[]>();
    for (const h of history ?? []) {
      const k = (h.loose_key ?? h.player_key) as string;
      const list = byKey.get(k) ?? [];
      list.push({ season: h.season, games_played: h.games_played });
      byKey.set(k, list);
    }

    // Key by loose_key so we match player_pool ids regardless of punctuation.
    const stats: StatRow[] = (rows ?? []).map((r) => {
      const key = (r.loose_key ?? r.player_key) as string;
      return {
        player_key: key,
        games_played: r.games_played,
        minutes_per_game: r.minutes_per_game,
        pts: r.pts,
        reb: r.reb,
        ast: r.ast,
        stl: r.stl,
        blk: r.blk,
        tov: r.tov,
        fg_made: r.fg_made,
        fg_att: r.fg_att,
        fg_pct: r.fg_pct,
        fg3_made: r.fg3_made,
        ft_made: r.ft_made,
        ft_att: r.ft_att,
        ft_pct: r.ft_pct,
        availability: computeAvailability(byKey.get(key) ?? []),
      };
    });


    const values = computeAuctionValues(stats, data);
    const out: Record<string, number> = {};
    for (const [key, v] of values) out[key] = v.dollars;
    return out;
  });
