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
 * The official HoopRoom Big Board — one global, admin-curated ranking that
 * applies in every draft room. Everyone can read it; only admins can save it
 * (enforced by RLS). Players not on the board fall back to the z-score
 * HoopRank formula.
 */
export function useBigBoard() {
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from("global_player_ranks")
      .select("player_id, player_name, player_position, player_team, rank")
      .order("rank", { ascending: true });
    if (!error) setBoard((data ?? []) as BoardEntry[]);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    reload().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [reload]);

  /** Replace the whole global board with `entries` (ordered best → worst). Admin only. */
  const replaceAll = useCallback(
    async (entries: Omit<BoardEntry, "rank">[]) => {
      const del = await supabase
        .from("global_player_ranks")
        .delete()
        .not("id", "is", null);
      if (del.error) throw new Error(del.error.message);
      if (entries.length > 0) {
        const rows = entries.map((e, i) => ({ ...e, rank: i + 1 }));
        const ins = await supabase.from("global_player_ranks").insert(rows);
        if (ins.error) throw new Error(ins.error.message);
      }
      await reload();
    },
    [reload],
  );

  /** player_id -> board rank (1 = best). */
  const rankMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of board) m[b.player_id] = b.rank;
    return m;
  }, [board]);

  return { board, rankMap, loading, reload, replaceAll };
}
