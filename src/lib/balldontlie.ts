// Thin client for balldontlie active players. Free, no API key for /v1 basic endpoints.
// Docs: https://docs.balldontlie.io/

export type BdlPlayer = {
  id: number;
  first_name: string;
  last_name: string;
  position: string | null;
  team: { id: number; abbreviation: string; full_name: string } | null;
};

export type DraftablePlayer = {
  id: string; // stable player_key, used as draft_picks.player_id
  name: string;
  position: string;
  team: string;
  teamFull: string;
  nbaPlayerId?: number | null; // NBA stats id used for CDN headshots
};

const BDL_BASE = "https://api.balldontlie.io/v1";

/**
 * Fetch all active NBA players. Paginates through cursor-based results.
 * Cached in-memory per page-load via SWR-style consumers; we don't cache here.
 */
export async function fetchActivePlayers(): Promise<DraftablePlayer[]> {
  const all: BdlPlayer[] = [];
  let cursor: number | null = 0;
  let safety = 0;

  while (cursor !== null && safety < 20) {
    const url = new URL(`${BDL_BASE}/players/active`);
    url.searchParams.set("per_page", "100");
    if (cursor) url.searchParams.set("cursor", String(cursor));

    const res = await fetch(url.toString(), {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`balldontlie /players/active failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      data: BdlPlayer[];
      meta: { next_cursor: number | null };
    };
    all.push(...json.data);
    cursor = json.meta?.next_cursor ?? null;
    safety += 1;
  }

  return all
    .filter((p) => p.team && p.team.abbreviation) // active w/ a team only
    .map<DraftablePlayer>((p) => ({
      id: String(p.id),
      name: `${p.first_name} ${p.last_name}`.trim(),
      position: p.position || "—",
      team: p.team!.abbreviation,
      teamFull: p.team!.full_name,
    }));
}
