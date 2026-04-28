import { createServerFn } from "@tanstack/react-start";
import type { DraftablePlayer } from "@/lib/balldontlie";

type BdlPlayer = {
  id: number;
  first_name: string;
  last_name: string;
  position: string | null;
  team: { id: number; abbreviation: string; full_name: string } | null;
};

export const fetchActivePlayersServer = createServerFn({ method: "GET" }).handler(
  async (): Promise<DraftablePlayer[]> => {
    const apiKey = process.env.BALLDONTLIE_API_KEY;
    if (!apiKey) {
      throw new Error("BALLDONTLIE_API_KEY is not configured");
    }

    const all: BdlPlayer[] = [];
    let cursor: number | null = 0;
    let safety = 0;

    while (cursor !== null && safety < 20) {
      const url = new URL("https://api.balldontlie.io/v1/players/active");
      url.searchParams.set("per_page", "100");
      if (cursor) url.searchParams.set("cursor", String(cursor));

      const res = await fetch(url.toString(), {
        headers: { accept: "application/json", Authorization: apiKey },
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
      .filter((p) => p.team && p.team.abbreviation)
      .map<DraftablePlayer>((p) => ({
        id: String(p.id),
        name: `${p.first_name} ${p.last_name}`.trim(),
        position: p.position || "—",
        team: p.team!.abbreviation,
        teamFull: p.team!.full_name,
      }));
  },
);
