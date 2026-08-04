import { supabaseAdmin } from "@/integrations/supabase/client.server";

const looseKeyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function currentSeasonLabel(offset = 0): string {
  const now = new Date();
  const startYear = (now.getUTCMonth() + 1 >= 10 ? now.getUTCFullYear() : now.getUTCFullYear() - 1) - offset;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

type NbaStatsResponse = {
  resultSets: Array<{ headers: string[]; rowSet: Array<Array<string | number | null>> }>;
};

/** Rookie names for a given season, straight from NBA.com's rookie filter. */
async function fetchRookieNames(season: string): Promise<{ name: string; id: number | null }[]> {
  const url = new URL("https://stats.nba.com/stats/leaguedashplayerstats");
  const params: Record<string, string> = {
    MeasureType: "Base",
    PerMode: "PerGame",
    PlusMinus: "N",
    PaceAdjust: "N",
    Rank: "N",
    Season: season,
    SeasonType: "Regular Season",
    Outcome: "",
    Location: "",
    Month: "0",
    SeasonSegment: "",
    DateFrom: "",
    DateTo: "",
    OpponentTeamID: "0",
    VsConference: "",
    VsDivision: "",
    GameSegment: "",
    Period: "0",
    LastNGames: "0",
    LeagueID: "00",
    TeamID: "0",
    PlayerExperience: "Rookie",
    PlayerPosition: "",
    StarterBench: "",
    DraftYear: "",
    DraftPick: "",
    College: "",
    Country: "",
    Height: "",
    Weight: "",
    TwoWay: "0",
    ShotClockRange: "",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Referer: "https://www.nba.com/",
      Origin: "https://www.nba.com",
      "x-nba-stats-origin": "stats",
      "x-nba-stats-token": "true",
    },
  });
  if (!res.ok) throw new Error(`nba.com rookies ${season}: ${res.status}`);
  const json = (await res.json()) as NbaStatsResponse;
  const set = json.resultSets?.[0];
  if (!set) return [];
  const iName = set.headers.indexOf("PLAYER_NAME");
  const iId = set.headers.indexOf("PLAYER_ID");
  return set.rowSet.map((row) => ({
    name: String(row[iName] ?? "").trim(),
    id: (row[iId] as number | null) ?? null,
  }));
}

/**
 * Recompute `players.is_rookie` from NBA.com's rookie leaderboard for the most
 * recent season with data. Everyone else is explicitly un-flagged so a stale
 * bad run can't silently turn a rookie draft into a full-pool draft.
 */
export async function refreshRookieFlags(): Promise<number> {
  let rookies: { name: string; id: number | null }[] = [];
  for (let offset = 0; offset < 2 && rookies.length === 0; offset += 1) {
    try {
      rookies = await fetchRookieNames(currentSeasonLabel(offset));
    } catch (err) {
      console.error("Rookie fetch failed:", err);
    }
  }
  if (rookies.length === 0) return 0;

  const rookieLoose = new Set(rookies.map((r) => looseKeyOf(r.name)).filter(Boolean));

  const { data: activeRows } = await supabaseAdmin
    .from("players")
    .select("player_key, loose_key, full_name")
    .eq("is_active", true);
  if (!activeRows) return 0;

  const rookieKeys: string[] = [];
  const nonRookieKeys: string[] = [];
  for (const p of activeRows) {
    const key = p.loose_key || looseKeyOf(p.full_name ?? p.player_key);
    (rookieLoose.has(key) ? rookieKeys : nonRookieKeys).push(p.player_key);
  }

  if (rookieKeys.length > 0) {
    await supabaseAdmin.from("players").update({ is_rookie: true }).in("player_key", rookieKeys);
  }
  // Chunk the un-flag update to keep the URL length sane.
  for (let i = 0; i < nonRookieKeys.length; i += 200) {
    await supabaseAdmin
      .from("players")
      .update({ is_rookie: false })
      .in("player_key", nonRookieKeys.slice(i, i + 200));
  }
  return rookieKeys.length;
}
