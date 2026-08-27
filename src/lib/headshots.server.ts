import { supabaseAdmin } from "@/integrations/supabase/client.server";

// The NBA CDN always returns 200 for a valid-looking player id. When no photo
// has been published it serves the generic silhouette placeholder, which is a
// fixed-size file. Detect it by byte length so we can fall back to initials.
const PLACEHOLDER_BYTES = 4937;

function headshotUrl(id: number) {
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
}

async function hasRealHeadshot(id: number): Promise<boolean | null> {
  try {
    const res = await fetch(headshotUrl(id), { cache: "no-store" });
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;
    return buf.byteLength !== PLACEHOLDER_BYTES;
  } catch {
    return null; // network hiccup — leave the current flag alone
  }
}

/**
 * Re-scan every player with an NBA id and record whether a real headshot is
 * published. Rookie photos appear gradually, so this is safe to re-run.
 */
export async function refreshHeadshotFlags(): Promise<{
  checked: number;
  withPhoto: number;
  withoutPhoto: number;
  updated: number;
}> {
  const { data, error } = await supabaseAdmin
    .from("players")
    .select("id, nba_player_id, has_headshot")
    .not("nba_player_id", "is", null);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    nba_player_id: number;
    has_headshot: boolean | null;
  }>;

  const results: Array<{ id: string; has: boolean }> = [];
  const CONCURRENCY = 12;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      batch.map(async (r) => ({ row: r, has: await hasRealHeadshot(r.nba_player_id) })),
    );
    for (const c of checked) {
      if (c.has === null) continue;
      results.push({ id: c.row.id, has: c.has });
    }
  }

  const toTrue = results.filter((r) => r.has).map((r) => r.id);
  const toFalse = results.filter((r) => !r.has).map((r) => r.id);

  let updated = 0;
  for (const [ids, value] of [
    [toTrue, true],
    [toFalse, false],
  ] as Array<[string[], boolean]>) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      if (chunk.length === 0) continue;
      const { error: upErr } = await supabaseAdmin
        .from("players")
        .update({ has_headshot: value })
        .in("id", chunk);
      if (upErr) throw new Error(upErr.message);
      updated += chunk.length;
    }
  }

  return {
    checked: results.length,
    withPhoto: toTrue.length,
    withoutPhoto: toFalse.length,
    updated,
  };
}
