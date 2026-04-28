import { createServerFn } from "@tanstack/react-start";
import type { DraftablePlayer } from "@/lib/balldontlie";
import { buildFallbackPlayerPool, playerKeyFromName, toDraftablePlayer } from "@/lib/playerPool";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type BdlPlayer = {
  id: number;
  first_name: string;
  last_name: string;
  position: string | null;
  team: { id: number; abbreviation: string; full_name: string } | null;
};

type BdlResponse = {
  data: BdlPlayer[];
  meta: { next_cursor: number | null };
};

async function fetchPlayersPage(endpoint: string, apiKey: string, cursor: number | null) {
  const url = new URL(endpoint);
  url.searchParams.set("per_page", "100");
  if (cursor) url.searchParams.set("cursor", String(cursor));

  return fetch(url.toString(), {
    headers: { accept: "application/json", Authorization: apiKey },
  });
}

async function fetchAllFromBdl(): Promise<BdlPlayer[]> {
  const apiKey = process.env.BALLDONTLIE_API_KEY;
  if (!apiKey) throw new Error("BALLDONTLIE_API_KEY not configured");

  const all: BdlPlayer[] = [];
  let cursor: number | null = 0;
  let safety = 0;
  let endpoint = "https://api.balldontlie.io/v1/players/active";

  while (cursor !== null && safety < 40) {
    let res = await fetchPlayersPage(endpoint, apiKey, cursor);
    if (!res.ok && endpoint.endsWith("/players/active") && [401, 403, 404].includes(res.status)) {
      endpoint = "https://api.balldontlie.io/v1/players";
      cursor = 0;
      safety = 0;
      all.length = 0;
      res = await fetchPlayersPage(endpoint, apiKey, cursor);
    }
    if (!res.ok) throw new Error(`balldontlie fetch failed: ${res.status}`);

    const json = (await res.json()) as BdlResponse;
    all.push(...json.data);
    cursor = json.meta?.next_cursor ?? null;
    safety += 1;
  }

  return all.filter((p) => p.team && p.team.abbreviation);
}

/**
 * Map balldontlie ID -> NBA stats player ID. balldontlie does not expose this,
 * but the NBA CDN headshot URL uses NBA's own IDs. We don't ship a static
 * mapping yet, so we leave nba_player_id null on seed; future work can backfill
 * via name match against an NBA roster snapshot. PlayerAvatar gracefully falls
 * back to initials when nba_player_id is null.
 */
async function seedPlayersFromBdl(): Promise<void> {
  const players = await fetchAllFromBdl();
  if (players.length === 0) return;

  const rows = players.map((p) => {
    const fullName = `${p.first_name} ${p.last_name}`.trim();
    return {
      player_key: playerKeyFromName(fullName),
      bdl_player_id: p.id,
      nba_player_id: null as number | null,
      first_name: p.first_name,
      last_name: p.last_name,
      full_name: fullName,
      position: p.position || null,
      team_abbreviation: p.team!.abbreviation,
      team_full_name: p.team!.full_name,
      is_active: true,
    };
  });

  // Dedupe by player_key in case of name collisions before sending to DB
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    if (seen.has(r.player_key)) return false;
    seen.add(r.player_key);
    return true;
  });

  await supabaseAdmin
    .from("players")
    .upsert(unique, { onConflict: "player_key", ignoreDuplicates: false });
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

    // 2) DB empty — try a one-time seed from balldontlie, then re-read.
    try {
      await seedPlayersFromBdl();
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
