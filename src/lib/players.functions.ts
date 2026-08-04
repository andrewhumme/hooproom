import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DraftablePlayer } from "@/lib/balldontlie";
import { buildFallbackPlayerPool, playerKeyFromName, toDraftablePlayer } from "@/lib/playerPool";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type NbaIndexResponse = {
  resultSets: Array<{
    name: string;
    headers: string[];
    rowSet: Array<Array<string | number | null>>;
  }>;
};

const POSITION_MAP: Record<string, string> = {
  Guard: "G",
  Forward: "F",
  Center: "C",
  "Guard-Forward": "G-F",
  "Forward-Guard": "F-G",
  "Forward-Center": "F-C",
  "Center-Forward": "C-F",
};

const SELECT_COLS =
  "player_key, full_name, position, team_abbreviation, team_full_name, nba_player_id";

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Seed/refresh `public.players` from the NBA CDN player index. This is the
 * canonical source: it includes NBA's own PERSON_ID values which power the
 * headshot CDN, plus FROM_YEAR / DRAFT_YEAR which we use to flag rookies.
 *
 * We only keep players currently rostered to a team (TEAM_ABBREVIATION present).
 */
async function seedPlayersFromNba(): Promise<void> {
  const res = await fetch(
    "https://cdn.nba.com/static/json/staticData/playerIndex.json",
    { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.nba.com/" } },
  );
  if (!res.ok) throw new Error(`NBA player index fetch failed: ${res.status}`);

  const json = (await res.json()) as NbaIndexResponse;
  const rs = json.resultSets?.[0];
  if (!rs) throw new Error("NBA player index missing resultSets");

  const idx: Record<string, number> = {};
  rs.headers.forEach((h, i) => (idx[h] = i));

  const seen = new Set<string>();
  const rows = [];
  for (const row of rs.rowSet) {
    const teamAbbr = row[idx.TEAM_ABBREVIATION] as string | null;
    const teamId = row[idx.TEAM_ID] as number | null;
    if (!teamAbbr || !teamId) continue; // free agents — skip

    const first = String(row[idx.PLAYER_FIRST_NAME] ?? "").trim();
    const last = String(row[idx.PLAYER_LAST_NAME] ?? "").trim();
    const fullName = `${first} ${last}`.trim();
    if (!fullName) continue;

    const key = playerKeyFromName(fullName);
    if (seen.has(key)) continue;
    seen.add(key);

    const posRaw = (row[idx.POSITION] as string | null) ?? "";
    const position = POSITION_MAP[posRaw] ?? (posRaw ? posRaw.slice(0, 3) : null);

    rows.push({
      player_key: key,
      nba_player_id: row[idx.PERSON_ID] as number,
      bdl_player_id: null as number | null,
      first_name: first,
      last_name: last,
      full_name: fullName,
      position,
      team_abbreviation: teamAbbr,
      team_full_name: `${row[idx.TEAM_CITY] ?? ""} ${row[idx.TEAM_NAME] ?? ""}`.trim(),
      is_active: true,
      from_year: num(row[idx.FROM_YEAR]),
      to_year: num(row[idx.TO_YEAR]),
      draft_year: num(row[idx.DRAFT_YEAR]),
      is_rookie: false,
    });
  }

  if (rows.length === 0) return;

  // Rookie class = players whose first NBA season is the newest season present,
  // or who were selected in the newest draft class present.
  const latestFrom = Math.max(...rows.map((r) => r.from_year ?? 0));
  const latestDraft = Math.max(...rows.map((r) => r.draft_year ?? 0));
  for (const r of rows) {
    r.is_rookie =
      (latestFrom > 0 && r.from_year === latestFrom) ||
      (latestDraft > 0 && r.draft_year === latestDraft && (r.from_year ?? latestFrom) >= latestDraft);
  }

  await supabaseAdmin
    .from("players")
    .upsert(rows, { onConflict: "player_key", ignoreDuplicates: false });

  // Clear stale rookie flags on anyone the NBA index didn't cover.
  await supabaseAdmin
    .from("players")
    .update({ is_rookie: false })
    .is("from_year", null)
    .eq("is_rookie", true);
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

    // Rookie flags come from NBA.com's rookie leaderboard. Refresh them
    // whenever a rookies-only pool is requested but nothing is flagged, or the
    // flags look implausible (a real rookie class is a small slice of the pool).
    if (rookiesOnly) {
      const { count: rookieCount } = await supabaseAdmin
        .from("players")
        .select("player_key", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("is_rookie", true);
      const { count: totalCount } = await supabaseAdmin
        .from("players")
        .select("player_key", { count: "exact", head: true })
        .eq("is_active", true);
      const implausible =
        !rookieCount || (totalCount ? rookieCount / totalCount > 0.35 : false);
      if (implausible) {
        try {
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



