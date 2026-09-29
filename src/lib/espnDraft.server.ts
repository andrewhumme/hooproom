// NBA draft class from ESPN's public draft API. Used for rookie flags and
// draft slots because stats.nba.com stalls requests from servers.
import { playerKeyFromName } from "@/lib/playerPool";

export type DraftPickRow = {
  player_key: string;
  first_name: string;
  last_name: string;
  full_name: string;
  position: string | null;
  team_abbreviation: string | null;
  team_full_name: string | null;
  draft_round: number;
  draft_number: number;
};

type EspnDraft = {
  picks?: Array<{
    overall: number;
    round: number;
    status?: string;
    teamId?: string;
    athlete?: { displayName?: string; position?: { id?: string } };
  }>;
  teams?: Array<{ id: string; abbreviation?: string; displayName?: string }>;
  positions?: Array<{ id: string; abbreviation?: string }>;
};

// ESPN team abbreviations that differ from the NBA's.
const TEAM_ABBR: Record<string, string> = {
  GS: "GSW",
  NY: "NYK",
  SA: "SAS",
  NO: "NOP",
  UTAH: "UTA",
  WSH: "WAS",
};

/** Completed picks for `year`'s draft; empty if the draft hasn't happened. */
export async function fetchDraftClass(year: number): Promise<DraftPickRow[]> {
  const res = await fetch(
    `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/draft?season=${year}`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`ESPN draft ${year}: ${res.status}`);
  const draft = (await res.json()) as EspnDraft;

  const teams = new Map((draft.teams ?? []).map((t) => [t.id, t]));
  const positions = new Map((draft.positions ?? []).map((p) => [p.id, p.abbreviation ?? null]));

  const rows: DraftPickRow[] = [];
  for (const pick of draft.picks ?? []) {
    const name = pick.athlete?.displayName?.trim();
    if (!name || pick.status !== "SELECTION_MADE") continue;
    const team = pick.teamId ? teams.get(pick.teamId) : undefined;
    const abbr = team?.abbreviation ?? null;
    const [first, ...rest] = name.split(/\s+/);
    rows.push({
      player_key: playerKeyFromName(name),
      first_name: first,
      last_name: rest.join(" ") || first,
      full_name: name,
      position: positions.get(pick.athlete?.position?.id ?? "") ?? null,
      team_abbreviation: abbr ? (TEAM_ABBR[abbr] ?? abbr) : null,
      team_full_name: team?.displayName ?? null,
      draft_round: pick.round,
      draft_number: pick.overall,
    });
  }
  return rows;
}
