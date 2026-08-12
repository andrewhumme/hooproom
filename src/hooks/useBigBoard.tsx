import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BoardEntry = {
  player_id: string;
  player_name: string;
  player_position: string | null;
  player_team: string | null;
  rank: number;
};

/**
 * A user's personal Big Board — a manual ranking that overrides HoopRank for
 * the players they've placed on it. Global to the account, applies in every
 * draft room. Players not on the board fall back to the z-score formula.
 */
export function useBigBoard(userId: string | null) {
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setBoard([]);
      return;
    }
    const { data, error } = await supabase
      .from("user_player_ranks")
      .select("player_id, player_name, player_position, player_team, rank")
      .eq("user_id", userId)
      .order("rank", { ascending: true });
    if (!error) setBoard((data ?? []) as BoardEntry[]);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [userId, reload]);

  /** Replace the whole board with `entries` (ordered best → worst). */
  const replaceAll = useCallback(
    async (entries: Omit<BoardEntry, "rank">[]) => {
      if (!userId) return;
      const del = await supabase
        .from("user_player_ranks")
        .delete()
        .eq("user_id", userId);
      if (del.error) throw new Error(del.error.message);
      if (entries.length > 0) {
        const rows = entries.map((e, i) => ({ ...e, user_id: userId, rank: i + 1 }));
        const ins = await supabase.from("user_player_ranks").insert(rows);
        if (ins.error) throw new Error(ins.error.message);
      }
      await reload();
    },
    [userId, reload],
  );

  /** player_id -> manual rank (1 = best). */
  const rankMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of board) m[b.player_id] = b.rank;
    return m;
  }, [board]);

  return { board, rankMap, loading, reload, replaceAll };
}
