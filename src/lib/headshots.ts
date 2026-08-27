import { supabase } from "@/integrations/supabase/client";

// Set of NBA player ids that have NO real headshot published (the CDN serves a
// generic silhouette for them). Fetched once per session and shared by every
// PlayerAvatar so we can render initials instead of the silhouette.
let cache: Set<number> | null = null;
let inflight: Promise<Set<number>> | null = null;
const listeners = new Set<() => void>();

export function getMissingHeadshotIds(): Set<number> | null {
  return cache;
}

export function subscribeMissingHeadshots(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function loadMissingHeadshotIds(): Promise<Set<number>> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await supabase
        .from("players")
        .select("nba_player_id")
        .eq("has_headshot", false)
        .not("nba_player_id", "is", null);
      cache = new Set(
        ((data ?? []) as Array<{ nba_player_id: number | null }>)
          .map((r) => r.nba_player_id)
          .filter((v): v is number => typeof v === "number"),
      );
    } catch {
      cache = new Set();
    }
    listeners.forEach((fn) => fn());
    return cache;
  })();
  return inflight;
}
