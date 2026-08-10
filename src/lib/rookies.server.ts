import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { playerKeyFromName } from "@/lib/playerPool";

const looseKeyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const POSITION_MAP: Record<string, string> = {
  Guard: "G",
  Forward: "F",
  Center: "C",
  "Guard-Forward": "G-F",
  "Forward-Guard": "F-G",
  "Forward-Center": "F-C",
  "Center-Forward": "C-F",
};

function seasonStartYear(offset = 0): number {
  const now = new Date();
  return (
    (now.getUTCMonth() + 1 >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1) - offset
  );
}

function seasonLabel(offset = 0): string {
  const y = seasonStartYear(offset);
  return `${y}-${String(y + 1).slice(-2)}`;
}

type NbaStatsResponse = {
  resultSets: Array<{ headers: string[]; rowSet: Array<Array<string | number | null>> }>;
};

const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Full league player index for a season — includes players who have not played
 * a game yet (this year's draft class), which the rookie *leaderboard* cannot.
 */
async function fetchPlayerIndex(season: string) {
  const url = new URL("https://stats.nba.com/stats/playerindex");
  const params: Record<string, string> = {
    College: "",
    Country: "",
    DraftPick: "",
    DraftRound: "",
    DraftYear: "",
    Height: "",
    Historical: "0",
    LeagueID: "00",
    Season: season,
    SeasonType: "Regular Season",
    TeamID: "0",
    Weight: "",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { headers: NBA_HEADERS });
  if (!res.ok) throw new Error(`nba.com playerindex ${season}: ${res.status}`);
  const json = (await res.json()) as NbaStatsResponse;
  const set = json.resultSets?.[0];
  if (!set) return [];

  const idx: Record<string, number> = {};
  set.headers.forEach((h, i) => (idx[h] = i));

  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  for (const row of set.rowSet) {
    const teamAbbr = row[idx.TEAM_ABBREVIATION] as string | null;
    const teamId = row[idx.TEAM_ID] as number | null;
    if (!teamAbbr || !teamId) continue; // free agents

    const first = String(row[idx.PLAYER_FIRST_NAME] ?? "").trim();
    const last = String(row[idx.PLAYER_LAST_NAME] ?? "").trim();
    const fullName = `${first} ${last}`.trim();
    if (!fullName) continue;

    const key = playerKeyFromName(fullName);
    if (seen.has(key)) continue;
    seen.add(key);

    const posRaw = (row[idx.POSITION] as string | null) ?? "";
    rows.push({
      player_key: key,
      nba_player_id: row[idx.PERSON_ID] as number,
      first_name: first,
      last_name: last,
      full_name: fullName,
      position: POSITION_MAP[posRaw] ?? (posRaw ? posRaw.slice(0, 3) : null),
      team_abbreviation: teamAbbr,
      team_full_name: `${row[idx.TEAM_CITY] ?? ""} ${row[idx.TEAM_NAME] ?? ""}`.trim(),
      is_active: true,
      from_year: num(row[idx.FROM_YEAR]),
      to_year: num(row[idx.TO_YEAR]),
      draft_year: num(row[idx.DRAFT_YEAR]),
      draft_round: num(row[idx.DRAFT_ROUND]),
      draft_number: num(row[idx.DRAFT_NUMBER]),
      is_rookie: false,
    });
  }
  return rows;
}

/**
 * Official NBA draft results for a draft year. The player *index* often ships
 * a fresh class with null DRAFT_ROUND/DRAFT_NUMBER, so rookie boards had no
 * real draft order. drafthistory is the authoritative source.
 */
export async function syncDraftHistory(year?: number): Promise<number> {
  const draftYear = year ?? seasonStartYear();
  const url = new URL("https://stats.nba.com/stats/drafthistory");
  const params: Record<string, string> = {
    College: "",
    Country: "",
    LeagueID: "00",
    OverallPick: "",
    RoundNum: "",
    RoundPick: "",
    Season: String(draftYear),
    TeamID: "0",
    TopX: "",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { headers: NBA_HEADERS });
  if (!res.ok) throw new Error(`nba.com drafthistory ${draftYear}: ${res.status}`);
  const json = (await res.json()) as NbaStatsResponse;
  const set = json.resultSets?.[0];
  if (!set) return 0;

  const idx: Record<string, number> = {};
  set.headers.forEach((h, i) => (idx[h] = i));

  const picks = set.rowSet
    .map((row) => ({
      personId: num(row[idx.PERSON_ID]),
      name: String(row[idx.PLAYER_NAME] ?? "").trim(),
      round: num(row[idx.ROUND_NUMBER]),
      overall: num(row[idx.OVERALL_PICK]),
    }))
    .filter((p) => p.name && p.overall);

  if (picks.length === 0) return 0;

  const { data: activeRows } = await supabaseAdmin
    .from("players")
    .select("player_key, loose_key, full_name, nba_player_id");
  const byLoose = new Map<string, string>();
  const byNbaId = new Map<number, string>();
  for (const p of activeRows ?? []) {
    byLoose.set(p.loose_key || looseKeyOf(p.full_name ?? p.player_key), p.player_key);
    if (p.nba_player_id) byNbaId.set(p.nba_player_id, p.player_key);
  }

  let updated = 0;
  for (const pick of picks) {
    const key =
      (pick.personId ? byNbaId.get(pick.personId) : undefined) ??
      byLoose.get(looseKeyOf(pick.name));
    if (!key) continue;
    const { error } = await supabaseAdmin
      .from("players")
      .update({
        draft_year: draftYear,
        draft_round: pick.round,
        draft_number: pick.overall,
      })
      .eq("player_key", key);
    if (!error) updated += 1;
  }
  return updated;
}

/** Rookie names for a given season, from NBA.com's rookie stats filter. */
async function fetchRookieNames(season: string): Promise<string[]> {
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

  const res = await fetch(url.toString(), { headers: NBA_HEADERS });
  if (!res.ok) throw new Error(`nba.com rookies ${season}: ${res.status}`);
  const json = (await res.json()) as NbaStatsResponse;
  const set = json.resultSets?.[0];
  if (!set) return [];
  const iName = set.headers.indexOf("PLAYER_NAME");
  return set.rowSet.map((row) => String(row[iName] ?? "").trim()).filter(Boolean);
}

async function applyRookieKeys(rookieLoose: Set<string>): Promise<number> {
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

  for (let i = 0; i < rookieKeys.length; i += 200) {
    await supabaseAdmin
      .from("players")
      .update({ is_rookie: true })
      .in("player_key", rookieKeys.slice(i, i + 200));
  }
  for (let i = 0; i < nonRookieKeys.length; i += 200) {
    await supabaseAdmin
      .from("players")
      .update({ is_rookie: false })
      .in("player_key", nonRookieKeys.slice(i, i + 200));
  }
  return rookieKeys.length;
}

/**
 * Sync `public.players` from NBA.com's player index for the upcoming/current
 * season. Returns the roster rows written (empty when NBA.com is unreachable).
 */
export async function syncPlayerIndex(): Promise<Array<Record<string, unknown>>> {
  let rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < 2 && rows.length === 0; offset += 1) {
    try {
      rows = await fetchPlayerIndex(seasonLabel(offset));
    } catch (err) {
      console.error("Player index fetch failed:", err);
    }
  }
  if (rows.length === 0) return [];

  // Chunked upsert: `nba_player_id` is UNIQUE, so a single stale row can fail
  // an entire batch. Retry failed batches row-by-row so one bad row can't
  // silently drop the whole roster refresh (that's how this year's draft class
  // went missing).
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await supabaseAdmin
      .from("players")
      .upsert(batch as never, { onConflict: "player_key", ignoreDuplicates: false });
    if (!error) {
      written += batch.length;
      continue;
    }
    console.error("Player upsert batch failed, retrying rows:", error.message);
    for (const row of batch) {
      const { error: rowErr } = await supabaseAdmin
        .from("players")
        .upsert(row as never, { onConflict: "player_key", ignoreDuplicates: false });
      if (rowErr) {
        // Almost always a nba_player_id collision with a renamed key: fall back
        // to an update keyed on the NBA id.
        const { error: fixErr } = await supabaseAdmin
          .from("players")
          .update(row as never)
          .eq("nba_player_id", row.nba_player_id as number);
        if (fixErr) console.error(`Player row failed (${row.full_name}):`, rowErr.message);
        else written += 1;
      } else {
        written += 1;
      }
    }
  }
  if (written === 0) return [];

  // Anyone rostered last sync but missing from the current index is inactive.
  const keys = new Set(rows.map((r) => r.player_key as string));


  const { data: existing } = await supabaseAdmin
    .from("players")
    .select("player_key")
    .eq("is_active", true);
  const stale = (existing ?? [])
    .map((p) => p.player_key)
    .filter((k) => !keys.has(k));
  for (let i = 0; i < stale.length; i += 200) {
    await supabaseAdmin
      .from("players")
      .update({ is_active: false })
      .in("player_key", stale.slice(i, i + 200));
  }

  return rows;
}

/**
 * Refresh rosters and recompute `players.is_rookie` for the current draft
 * season. Rookies are players whose first NBA season is this season (draft
 * class included, even before they play a game); everyone else is un-flagged.
 * Falls back to NBA.com's rookie leaderboard if the index is unavailable.
 */
export async function refreshRookieFlags(): Promise<number> {
  const rows = await syncPlayerIndex();

  // Real draft slots for the current class — the index leaves them null.
  for (const y of [seasonStartYear(), seasonStartYear(1)]) {
    try {
      const n = await syncDraftHistory(y);
      if (n > 0) break;
    } catch (err) {
      console.error(`Draft history sync failed (${y}):`, err);
    }
  }



  if (rows.length > 0) {
    const startYear = seasonStartYear();
    const latestFrom = Math.max(...rows.map((r) => (r.from_year as number) ?? 0));
    // Preseason the index may still carry last season's FROM_YEAR values.
    const rookieYear = Math.max(latestFrom, 0) >= startYear ? startYear : latestFrom;

    const rookieLoose = new Set(
      rows
        .filter((r) => {
          const from = r.from_year as number | null;
          const draft = r.draft_year as number | null;
          return from === rookieYear || (from == null && draft === rookieYear);
        })
        .map((r) => looseKeyOf(String(r.full_name))),
    );
    if (rookieLoose.size > 0) return applyRookieKeys(rookieLoose);
  }

  // Fallback: last completed season's rookie leaderboard.
  let names: string[] = [];
  for (let offset = 0; offset < 2 && names.length === 0; offset += 1) {
    try {
      names = await fetchRookieNames(seasonLabel(offset));
    } catch (err) {
      console.error("Rookie fetch failed:", err);
    }
  }
  if (names.length === 0) return 0;
  return applyRookieKeys(new Set(names.map(looseKeyOf).filter(Boolean)));
}
