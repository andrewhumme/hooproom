import { createServerFn } from "@tanstack/react-start";
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

/**
 * Seed `public.players` from the NBA CDN player index. This is the canonical
 * source: it includes NBA's own PERSON_ID values which power the headshot CDN
 * (https://cdn.nba.com/headshots/nba/latest/1040x760/{id}.png), so every
 * seeded row gets a working portrait with no name-matching guesswork.
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
    });
  }

  if (rows.length === 0) return;

  await supabaseAdmin
    .from("players")
    .upsert(rows, { onConflict: "player_key", ignoreDuplicates: false });
}

export const fetchActivePlayersServer = createServerFn({ method: "GET" }).handler(
  async (): Promise<DraftablePlayer[]> => {
    // 1) Read from our DB (canonical source, no rate limits).
    const { data, error } = await supabaseAdmin
      .from("players")
      .select("player_key, full_name, position, team_abbreviation, team_full_name, nba_player_id")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (!error && data && data.length > 0) {
      return data.map((p) =>
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

    // 2) DB empty — try a one-time seed from NBA CDN, then re-read.
    try {
      await seedPlayersFromNba();
      const { data: seeded } = await supabaseAdmin
        .from("players")
        .select("player_key, full_name, position, team_abbreviation, team_full_name, nba_player_id")
        .eq("is_active", true)
        .order("full_name", { ascending: true });

      if (seeded && seeded.length > 0) {
        return seeded.map((p) =>
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
    } catch (err) {
      console.error("Player seed failed, using static fallback:", err);
    }

    // 3) Last resort: static bundled pool.
    return buildFallbackPlayerPool();
  },
);
