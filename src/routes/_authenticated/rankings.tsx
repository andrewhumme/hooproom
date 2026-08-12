import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useBigBoard, type BoardEntry } from "@/hooks/useBigBoard";
import { fetchActivePlayersServer } from "@/lib/players.functions";
import { getPlayerRanksServer } from "@/lib/playerRanking.functions";
import { hoopRankOf, UNRANKED, type RankMap } from "@/lib/playerRanking";
import type { DraftablePlayer } from "@/lib/balldontlie";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import {
  ArrowLeft,
  GripVertical,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/rankings")({
  component: BigBoardPage,
  head: () => ({
    meta: [
      { title: "My Big Board — HoopRoom" },
      {
        name: "description",
        content:
          "Manually rank your top 60 NBA players. HoopRoom's z-score formula ranks everyone below your board.",
      },
      { property: "og:title", content: "My Big Board — HoopRoom" },
      {
        property: "og:description",
        content:
          "Manually rank your top 60 NBA players and let HoopRank take over from there.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const BOARD_SIZE = 60;

type Item = Omit<BoardEntry, "rank">;

function BigBoardPage() {
  const { user } = useAuth();
  const { board, loading: boardLoading, replaceAll } = useBigBoard(user?.id ?? null);

  const [items, setItems] = useState<Item[]>([]);
  const [players, setPlayers] = useState<DraftablePlayer[]>([]);
  const [ranks, setRanks] = useState<RankMap>({});
  const [poolLoading, setPoolLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const dragIdx = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const seeded = useRef(false);

  // Player pool + HoopRank (default 12-team, 13-round, 9-CAT shape).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchActivePlayersServer({ data: { pool: "all" } }),
      getPlayerRanksServer({
        data: { scoringFormat: "9-CAT", teamCount: 12, rosterSize: 13 },
      }),
    ])
      .then(([list, r]) => {
        if (cancelled) return;
        setPlayers(list);
        setRanks(r);
      })
      .catch((e: unknown) => {
        console.error("big board pool failed", e);
        toast.error("Couldn't load the player pool");
      })
      .finally(() => {
        if (!cancelled) setPoolLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hoopTop = useCallback(
    (n: number): Item[] =>
      [...players]
        .filter((p) => hoopRankOf(ranks, p.id) !== UNRANKED)
        .sort((a, b) => hoopRankOf(ranks, a.id) - hoopRankOf(ranks, b.id))
        .slice(0, n)
        .map((p) => ({
          player_id: p.id,
          player_name: p.name,
          player_position: p.position || null,
          player_team: p.team || null,
        })),
    [players, ranks],
  );

  // Seed the editor: saved board if there is one, otherwise HoopRank's top 60.
  useEffect(() => {
    if (seeded.current) return;
    if (boardLoading || poolLoading) return;
    if (board.length > 0) {
      setItems(
        board.map((b) => ({
          player_id: b.player_id,
          player_name: b.player_name,
          player_position: b.player_position,
          player_team: b.player_team,
        })),
      );
      seeded.current = true;
    } else if (players.length > 0) {
      setItems(hoopTop(BOARD_SIZE));
      seeded.current = true;
    }
  }, [board, boardLoading, poolLoading, players, hoopTop]);

  const onBoard = useMemo(
    () => new Set(items.map((i) => i.player_id)),
    [items],
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter((p) => !onBoard.has(p.id))
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q),
      )
      .sort((a, b) => hoopRankOf(ranks, a.id) - hoopRankOf(ranks, b.id))
      .slice(0, 8);
  }, [search, players, onBoard, ranks]);

  const move = (from: number, to: number) => {
    if (from === to) return;
    setItems((prev) => {
      const next = [...prev];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
    setDirty(true);
  };

  const remove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.player_id !== id));
    setDirty(true);
  };

  const add = (p: DraftablePlayer) => {
    setItems((prev) => [
      ...prev,
      {
        player_id: p.id,
        player_name: p.name,
        player_position: p.position || null,
        player_team: p.team || null,
      },
    ]);
    setDirty(true);
    setSearch("");
  };

  const save = async () => {
    setSaving(true);
    try {
      await replaceAll(items);
      setDirty(false);
      toast.success("Big Board saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your board");
    } finally {
      setSaving(false);
    }
  };

  const resetToHoopRank = () => {
    setItems(hoopTop(BOARD_SIZE));
    setDirty(true);
  };

  const busy = boardLoading || poolLoading;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/me">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to my account
        </Link>
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight">My Big Board</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rank your top {BOARD_SIZE} manually. In every draft room these players
          sort first in your order — HoopRank's z-score formula takes over for
          everyone below the board.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={!dirty || saving || busy}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          Save board
        </Button>
        <Button variant="outline" onClick={resetToHoopRank} disabled={busy}>
          <RotateCcw className="mr-1 h-4 w-4" /> Reset to HoopRank top {BOARD_SIZE}
        </Button>
        <span className="text-xs font-bold text-muted-foreground">
          {items.length} ranked{dirty ? " · unsaved changes" : ""}
        </span>
      </div>

      <Card className="mb-4 border-2 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a player to add to your board…"
            className="pl-9"
          />
        </div>
        {searchResults.length > 0 && (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {searchResults.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-bold">
                  {p.name}
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    {p.team} · {p.position}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => add(p)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {busy ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading players…
        </div>
      ) : (
        <Card className="overflow-hidden border-2">
          <ul className="divide-y divide-border">
            {items.map((it, idx) => {
              const hr = hoopRankOf(ranks, it.player_id);
              return (
                <li
                  key={it.player_id}
                  draggable
                  onDragStart={() => {
                    dragIdx.current = idx;
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverIdx(idx);
                  }}
                  onDragLeave={() => setOverIdx((v) => (v === idx ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIdx.current != null) move(dragIdx.current, idx);
                    dragIdx.current = null;
                    setOverIdx(null);
                  }}
                  onDragEnd={() => {
                    dragIdx.current = null;
                    setOverIdx(null);
                  }}
                  className={`flex items-center gap-2 px-2 py-2 sm:px-3 ${
                    overIdx === idx ? "bg-primary/10" : ""
                  }`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                  <span className="w-6 shrink-0 text-center text-xs font-black tabular-nums text-primary">
                    {idx + 1}
                  </span>
                  <PlayerAvatar
                    name={it.player_name}
                    playerId={it.player_id}
                    className="h-8 w-8 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">
                      {it.player_name}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {it.player_team} · {it.player_position}
                      {hr !== UNRANKED && (
                        <span className="ml-1 inline-flex items-center gap-0.5">
                          <Sparkles className="h-2.5 w-2.5" /> HoopRank #{hr}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={idx === 0}
                      onClick={() => move(idx, idx - 1)}
                      title="Move up"
                    >
                      ↑
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={idx === items.length - 1}
                      onClick={() => move(idx, idx + 1)}
                      title="Move down"
                    >
                      ↓
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => remove(it.player_id)}
                      title="Remove from board"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {items.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Your board is empty — search above to add players, or reset to the
              HoopRank top {BOARD_SIZE}.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
