import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { StatRow } from "@/lib/auctionValues";
import { computeHoopRanks, type RankMap } from "@/lib/playerRanking";

const LATEST_SEASON = 2025;

/**
 * HoopRank for the whole player pool, tuned to a room's scoring format and
 * roster size. Keyed by loose player key (lowercased, punctuation stripped).
 */
export const getPlayerRanksServer = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { scoringFormat: string; teamCount: number; rosterSize: number }) => data,
  )
  .handler(async ({ data }): Promise<RankMap> => {
    const { data: rows, error } = await supabaseAdmin
      .from("player_season_stats")
      .select(
        "player_key, loose_key, games_played, minutes_per_game, pts, reb, ast, stl, blk, tov, fg_made, fg_att, fg_pct, fg3_made, ft_made, ft_att, ft_pct",
      )
      .eq("season", LATEST_SEASON);
    if (error) throw new Error(error.message);

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

    const poolSize = Math.max(200, data.teamCount * data.rosterSize * 3);
    return computeHoopRanks(stats, {
      scoringFormat: data.scoringFormat,
      poolSize,
    });
  });
