import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  computeAuctionValues,
  type LeagueShape,
  type StatRow,
} from "@/lib/auctionValues";

const LATEST_SEASON = 2025;

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

    // Key by loose_key so we match player_pool ids regardless of punctuation.
    const stats: StatRow[] = (rows ?? []).map((r) => ({
      player_key: (r.loose_key ?? r.player_key) as string,
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
    }));

    const values = computeAuctionValues(stats, data);
    const out: Record<string, number> = {};
    for (const [key, v] of values) out[key] = v.dollars;
    return out;
  });
