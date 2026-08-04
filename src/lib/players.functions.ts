import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DraftablePlayer } from "@/lib/balldontlie";
import { buildFallbackPlayerPool, toDraftablePlayer } from "@/lib/playerPool";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SELECT_COLS =
  "player_key, full_name, position, team_abbreviation, team_full_name, nba_player_id";

/**
 * Seed/refresh `public.players` from NBA.com's player index (the CDN static
 * index is 403 for us now). The index includes PERSON_ID for headshots plus
 * FROM_YEAR / DRAFT_YEAR, and lists this year's draft class before they play.
 */
async function seedPlayersFromNba(): Promise<void> {
  const { syncPlayerIndex } = await import("@/lib/rookies.server");
  await syncPlayerIndex();
}


type PlayerRow = {
  player_key: string;
  full_name: string;
  position: string | null;
  team_abbreviation: string | null;
  team_full_name: string | null;
  nba_player_id: number | null;
};

function mapRows(rows: PlayerRow[]): DraftablePlayer[] {
  return rows.map((p) =>
    toDraftablePlayer({
      name: p.full_name,
      position: p.position,
      team: p.team_abbreviation,
      teamFull: p.team_full_name,
      nbaPlayerId: p.nba_player_id,
      playerKey: p.player_key,
    }),
  );
}

export const fetchActivePlayersServer = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({ pool: z.enum(["all", "rookies"]).optional() })
      .optional()
      .parse(data ?? {}),
  )
  .handler(async ({ data }): Promise<DraftablePlayer[]> => {
    const rookiesOnly = data?.pool === "rookies";

    const query = () => {
      let q = supabaseAdmin.from("players").select(SELECT_COLS).eq("is_active", true);
      if (rookiesOnly) q = q.eq("is_rookie", true);
      return q.order("full_name", { ascending: true });
    };

    // Rookie flags come from NBA.com's player index. Refresh them whenever the
    // rookies-only pool is requested and the flags are missing, implausible
    // (a real class is a small slice of the pool), or belong to a past season.
    if (rookiesOnly) {
      const now = new Date();
      const startYear =
        now.getUTCMonth() + 1 >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
      const { data: rookieRows } = await supabaseAdmin
        .from("players")
        .select("player_key, from_year, draft_year")
        .eq("is_active", true)
        .eq("is_rookie", true);
      const { count: totalCount } = await supabaseAdmin
        .from("players")
        .select("player_key", { count: "exact", head: true })
        .eq("is_active", true);
      const rookieCount = rookieRows?.length ?? 0;
      const currentClass = (rookieRows ?? []).some(
        (r) => (r.from_year ?? r.draft_year ?? 0) >= startYear,
      );
      const stale =
        rookieCount === 0 ||
        !currentClass ||
        (totalCount ? rookieCount / totalCount > 0.35 : false);
      if (stale) {
        try {
          const { refreshRookieFlags } = await import("@/lib/rookies.server");
          await refreshRookieFlags();
        } catch (err) {
          console.error("Rookie flag refresh failed:", err);
        }
      }
    }



    // 1) Read from our DB (canonical source, no rate limits).
    const { data: rows, error } = await query();
    if (!error && rows && rows.length > 0) return mapRows(rows as PlayerRow[]);

    // 2) Empty — seed/refresh from NBA CDN and retry.
    try {
      await seedPlayersFromNba();
      const { data: seeded } = await query();
      if (seeded && seeded.length > 0) return mapRows(seeded as PlayerRow[]);
    } catch (err) {
      console.error("Player seed failed:", err);
    }

    // No rookie fallback: guessing from stats history over-flags veterans and
    // silently turns a rookie draft into a full-pool draft.
    if (rookiesOnly) return [];

    // 3) Last resort: static bundled pool.
    return buildFallbackPlayerPool();
  });
