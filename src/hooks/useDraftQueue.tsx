import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type QueueItem = {
  id: string;
  room_id: string;
  user_id: string;
  player_id: string;
  player_name: string;
  player_position: string | null;
  player_team: string | null;
  rank: number;
};

/**
 * Per-user draft queue for a room. Realtime-synced. Used by the server-side
 * autopick tick when a slow draft's clock expires.
 */
export function useDraftQueue(roomId: string | null, userId: string | null) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!roomId || !userId) {
      setQueue([]);
      return;
    }
    const { data, error } = await supabase
      .from("draft_queues")
      .select("*")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .order("rank", { ascending: true });
    if (!error) setQueue((data ?? []) as QueueItem[]);
  }, [roomId, userId]);

  useEffect(() => {
    if (!roomId || !userId) return;
    setLoading(true);
    reload().finally(() => setLoading(false));

    const ch = supabase
      .channel(`queue-${roomId}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "draft_queues",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          reload();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, userId, reload]);

  const add = useCallback(
    async (player: {
      id: string;
      name: string;
      position: string | null;
      team: string | null;
    }) => {
      if (!roomId || !userId) return;
      if (queue.some((q) => q.player_id === player.id)) return;
      const nextRank = (queue[queue.length - 1]?.rank ?? 0) + 1;
      const { error } = await supabase.from("draft_queues").insert({
        room_id: roomId,
        user_id: userId,
        player_id: player.id,
        player_name: player.name,
        player_position: player.position,
        player_team: player.team,
        rank: nextRank,
      });
      if (error) {
        console.error("[queue] add failed", error);
        toast.error(`Couldn't queue ${player.name}: ${error.message}`);
      } else {
        toast.success(`Queued ${player.name}`);
        reload();
      }
    },
    [roomId, userId, queue, reload],
  );

  const remove = useCallback(
    async (playerId: string) => {
      if (!roomId || !userId) return;
      const { error } = await supabase
        .from("draft_queues")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .eq("player_id", playerId);
      if (error) {
        console.error("[queue] remove failed", error);
        toast.error(`Couldn't remove from queue: ${error.message}`);
      } else {
        reload();
      }
    },
    [roomId, userId, reload],
  );

  const swap = useCallback(
    async (a: QueueItem, b: QueueItem) => {
      // Ranks have no unique constraint so we can update both rows directly.
      const r1 = await supabase
        .from("draft_queues")
        .update({ rank: b.rank })
        .eq("id", a.id);
      const r2 = await supabase
        .from("draft_queues")
        .update({ rank: a.rank })
        .eq("id", b.id);
      if (r1.error || r2.error) {
        console.error("[queue] swap failed", r1.error, r2.error);
        toast.error(
          `Couldn't reorder queue: ${(r1.error ?? r2.error)?.message}`,
        );
      }
      await reload();
    },
    [reload],
  );

  const moveUp = useCallback(
    async (playerId: string) => {
      const idx = queue.findIndex((q) => q.player_id === playerId);
      if (idx <= 0) return;
      await swap(queue[idx], queue[idx - 1]);
    },
    [queue, swap],
  );

  const moveDown = useCallback(
    async (playerId: string) => {
      const idx = queue.findIndex((q) => q.player_id === playerId);
      if (idx < 0 || idx >= queue.length - 1) return;
      await swap(queue[idx], queue[idx + 1]);
    },
    [queue, swap],
  );

  return { queue, loading, add, remove, moveUp, moveDown };
}
