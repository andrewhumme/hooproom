import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeAvailability, type StatRow } from "@/lib/auctionValues";
import { computeHoopRanks, type RankMap } from "@/lib/playerRanking";

const LATEST_SEASON = 2026;

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

    const poolSize = Math.max(200, data.teamCount * data.rosterSize * 3);
    return computeHoopRanks(stats, {
      scoringFormat: data.scoringFormat,
      poolSize,
    });
  });

