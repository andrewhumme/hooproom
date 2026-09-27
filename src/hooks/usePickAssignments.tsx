import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureGuestSession } from "@/lib/guestSession";

/**
 * Commissioner's custom pick assignments for a room (pick_number → team_idx).
 * Realtime-synced so the draft room reflects reassignments made in the lobby.
 */
export function usePickAssignments(roomId: string | null): ReadonlyMap<number, number> {
  const [assignments, setAssignments] = useState<ReadonlyMap<number, number>>(new Map());

  useEffect(() => {
    if (!roomId) return;
    let mounted = true;

    const load = async () => {
      try {
        await ensureGuestSession();
        const { data, error } = await supabase
          .from("draft_pick_assignments")
          .select("pick_number, team_idx")
          .eq("room_id", roomId);
        if (!mounted || error) return;
        setAssignments(new Map((data ?? []).map((a) => [a.pick_number, a.team_idx])));
      } catch (e) {
        // No session (e.g. guest sign-in unavailable) — fall back to snake order.
        console.warn("pick assignments unavailable", e);
      }
    };

    load();
    const channel = supabase
      .channel(`pick-assignments-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "draft_pick_assignments",
          filter: `room_id=eq.${roomId}`,
        },
        () => load(),
      )
      .subscribe();

    // Realtime can miss events while a tab is backgrounded — resync on wake.
    const resync = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", resync);

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [roomId]);

  return assignments;
}
