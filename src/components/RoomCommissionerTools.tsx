import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Repeat, Search, Trophy, X } from "lucide-react";
import { type DraftablePlayer } from "@/lib/balldontlie";

type Keeper = {
  id: string;
  room_id: string;
  team_idx: number;
  player_id: string;
  player_name: string;
  player_position: string | null;
  player_team: string | null;
  keeper_round: number | null;
};

type PickAssignment = {
  id: string;
  room_id: string;
  pick_number: number;
  team_idx: number;
};

type Participant = {
  id: string;
  team_name: string;
  is_bot?: boolean;
};

type Props = {
  roomId: string;
  teamCount: number;
  rounds: number;
  reversalRounds: number[];
  draftFormat: string;
  participants: Participant[];
  players: DraftablePlayer[];
};

/**
 * Snake math: which team owns this (round, pickInRound)?
 * Mirrors snake_default_team() in the DB.
 */
function defaultSnakeTeam(
  teamCount: number,
  reversalRounds: number[],
  round: number,
  pickInRound: number,
): number {
  const reversals = new Set(reversalRounds);
  let reverse = false;
  for (let r = 1; r < round; r++) {
    if (!reversals.has(r)) reverse = !reverse;
  }
  return reverse ? teamCount - pickInRound + 1 : pickInRound;
}

export function RoomCommissionerTools({
  roomId,
  teamCount,
  rounds,
  reversalRounds,
  draftFormat,
  participants,
  players,
}: Props) {
  const [keepers, setKeepers] = useState<Keeper[]>([]);
  const [assignments, setAssignments] = useState<PickAssignment[]>([]);
  const [keepersOpen, setKeepersOpen] = useState(false);
  const [picksOpen, setPicksOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSnake = draftFormat === "snake";

  // Load (also called after each mutation for instant feedback)
  const load = async () => {
    const [k, a] = await Promise.all([
      supabase.from("room_keepers").select("*").eq("room_id", roomId),
      supabase.from("draft_pick_assignments").select("*").eq("room_id", roomId),
    ]);
    if (k.data) setKeepers(k.data as Keeper[]);
    if (a.data) setAssignments(a.data as PickAssignment[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`commish-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_keepers", filter: `room_id=eq.${roomId}` },
        () => load(),
      )
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
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const teamName = (idx: number) =>
    participants[idx - 1]?.team_name ?? `Team ${idx}`;

  if (!isSnake) {
    return (
      <Card className="mt-6 border-2 border-dashed p-6 text-sm text-muted-foreground">
        Keepers and custom pick assignments are coming to auction drafts. For
        now they're available in snake drafts only.
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ─── Keepers ─── */}
      <Card className="overflow-hidden border-2">
        <button
          onClick={() => setKeepersOpen((v) => !v)}
          className="flex w-full items-center justify-between border-b-2 border-border bg-muted/40 px-4 py-3 text-left hover:bg-muted/60"
        >
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-black">Keepers</div>
              <div className="text-[11px] text-muted-foreground">
                Lock players to teams before the draft.{" "}
                {keepers.length > 0 && (
                  <span className="font-bold text-foreground">
                    {keepers.length} set
                  </span>
                )}
              </div>
            </div>
          </div>
          {keepersOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        {keepersOpen && (
          <KeepersPanel
            roomId={roomId}
            teamCount={teamCount}
            rounds={rounds}
            keepers={keepers}
            participants={participants}
            players={players}
            onError={setError}
          />
        )}
      </Card>

      {/* ─── Custom Picks ─── */}
      <Card className="overflow-hidden border-2">
        <button
          onClick={() => setPicksOpen((v) => !v)}
          className="flex w-full items-center justify-between border-b-2 border-border bg-muted/40 px-4 py-3 text-left hover:bg-muted/60"
        >
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-black">Custom draft picks</div>
              <div className="text-[11px] text-muted-foreground">
                Reassign individual picks for traded picks.{" "}
                {assignments.length > 0 && (
                  <span className="font-bold text-foreground">
                    {assignments.length} reassigned
                  </span>
                )}
              </div>
            </div>
          </div>
          {picksOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        {picksOpen && (
          <CustomPicksPanel
            roomId={roomId}
            teamCount={teamCount}
            rounds={rounds}
            reversalRounds={reversalRounds}
            assignments={assignments}
            teamName={teamName}
            onError={setError}
          />
        )}
      </Card>
    </div>
  );
}

/* ────────────── Keepers panel ────────────── */
function KeepersPanel({
  roomId,
  teamCount,
  rounds,
  keepers,
  participants,
  players,
  onError,
}: {
  roomId: string;
  teamCount: number;
  rounds: number;
  keepers: Keeper[];
  participants: Participant[];
  players: DraftablePlayer[];
  onError: (msg: string | null) => void;
}) {
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const keepersByTeam = useMemo(() => {
    const m = new Map<number, Keeper[]>();
    for (const k of keepers) {
      const list = m.get(k.team_idx) ?? [];
      list.push(k);
      m.set(k.team_idx, list);
    }
    return m;
  }, [keepers]);

  const takenIds = useMemo(() => new Set(keepers.map((k) => k.player_id)), [keepers]);

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players.slice(0, 50);
    return players
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [players, search]);

  const upsert = async (
    teamIdx: number,
    player: DraftablePlayer,
    keeperRound: number | null,
  ) => {
    onError(null);
    const { error } = await supabase.rpc("keeper_upsert", {
      _room_id: roomId,
      _team_idx: teamIdx,
      _player_id: player.id,
      _player_name: player.name,
      _player_position: player.position ?? null,
      _player_team: player.team ?? null,
      _keeper_round: keeperRound as number,
    });
    if (error) onError(error.message);
  };

  const remove = async (playerId: string) => {
    onError(null);
    const { error } = await supabase.rpc("keeper_remove", {
      _room_id: roomId,
      _player_id: playerId,
    });
    if (error) onError(error.message);
  };

  return (
    <div className="divide-y divide-border">
      {Array.from({ length: teamCount }).map((_, i) => {
        const teamIdx = i + 1;
        const name = participants[i]?.team_name ?? `Team ${teamIdx}`;
        const teamKeepers = keepersByTeam.get(teamIdx) ?? [];
        const isOpen = expandedTeam === teamIdx;
        return (
          <div key={teamIdx}>
            <button
              onClick={() => setExpandedTeam(isOpen ? null : teamIdx)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-[11px] font-black">
                  {teamIdx}
                </span>
                <span className="text-sm font-bold">{name}</span>
                {teamKeepers.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] font-black">
                    {teamKeepers.length} keeper{teamKeepers.length === 1 ? "" : "s"}
                  </Badge>
                )}
              </div>
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            {isOpen && (
              <div className="space-y-3 bg-muted/20 px-4 py-3">
                {/* Existing keepers */}
                {teamKeepers.length > 0 && (
                  <ul className="space-y-1.5">
                    {teamKeepers.map((k) => (
                      <li
                        key={k.id}
                        className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">
                            {k.player_name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {k.player_team ?? "—"} · {k.player_position ?? "—"}
                          </div>
                        </div>
                        <Select
                          value={k.keeper_round === null ? "none" : String(k.keeper_round)}
                          onValueChange={(v) => {
                            const round = v === "none" ? null : Number(v);
                            upsert(
                              teamIdx,
                              {
                                id: k.player_id,
                                name: k.player_name,
                                position: k.player_position ?? "",
                                team: k.player_team ?? "",
                                teamFull: k.player_team ?? "",
                              },
                              round,
                            );
                          }}
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No cost</SelectItem>
                            {Array.from({ length: rounds }).map((_, ri) => (
                              <SelectItem key={ri + 1} value={String(ri + 1)}>
                                Round {ri + 1}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => remove(k.player_id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Add keeper picker */}
                <div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search to add a keeper…"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  {search.trim() && (
                    <ul className="mt-2 max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border bg-background">
                      {filteredPlayers.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-muted-foreground">
                          No players match.
                        </li>
                      ) : (
                        filteredPlayers.map((p) => {
                          const taken = takenIds.has(p.id);
                          return (
                            <li
                              key={p.id}
                              className="flex items-center gap-2 px-2.5 py-1.5"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-bold">
                                  {p.name}
                                  {taken && (
                                    <span className="ml-1 text-[10px] font-bold uppercase text-muted-foreground">
                                      kept
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {p.team ?? "—"} · {p.position ?? "—"}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px] font-bold"
                                disabled={taken}
                                onClick={() => {
                                  upsert(teamIdx, p, null);
                                  setSearch("");
                                }}
                              >
                                Add
                              </Button>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ────────────── Custom picks panel ────────────── */
function CustomPicksPanel({
  roomId,
  teamCount,
  rounds,
  reversalRounds,
  assignments,
  teamName,
  onError,
}: {
  roomId: string;
  teamCount: number;
  rounds: number;
  reversalRounds: number[];
  assignments: PickAssignment[];
  teamName: (idx: number) => string;
  onError: (msg: string | null) => void;
}) {
  const assignmentMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of assignments) m.set(a.pick_number, a.team_idx);
    return m;
  }, [assignments]);

  const setPick = async (pickNumber: number, teamIdx: number) => {
    onError(null);
    const { error } = await supabase.rpc("pick_assignment_set", {
      _room_id: roomId,
      _pick_number: pickNumber,
      _team_idx: teamIdx,
    });
    if (error) onError(error.message);
  };

  const resetPick = async (pickNumber: number) => {
    onError(null);
    const { error } = await supabase.rpc("pick_assignment_reset", {
      _room_id: roomId,
      _pick_number: pickNumber,
    });
    if (error) onError(error.message);
  };

  return (
    <div className="space-y-2 p-4">
      <p className="text-[11px] text-muted-foreground">
        Click a pick to reassign it. Reassigned picks show in{" "}
        <span className="font-bold text-primary">primary color</span>.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-border bg-muted/40 px-2 py-1 text-left font-black uppercase tracking-widest">
                Rd
              </th>
              {Array.from({ length: teamCount }).map((_, i) => (
                <th
                  key={i}
                  className="border border-border bg-muted/40 px-2 py-1 text-center font-black"
                >
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rounds }).map((_, ri) => {
              const round = ri + 1;
              return (
                <tr key={round}>
                  <td className="border border-border bg-muted/40 px-2 py-1 text-center font-black">
                    {round}
                  </td>
                  {Array.from({ length: teamCount }).map((_, ci) => {
                    const pickInRound = ci + 1;
                    const pickNumber = ri * teamCount + pickInRound;
                    const defaultTeam = defaultSnakeTeam(
                      teamCount,
                      reversalRounds,
                      round,
                      pickInRound,
                    );
                    const override = assignmentMap.get(pickNumber);
                    const owner = override ?? defaultTeam;
                    const isOverridden = override !== undefined;
                    return (
                      <td
                        key={pickInRound}
                        className={`border border-border p-0 ${
                          isOverridden ? "bg-primary/10" : ""
                        }`}
                      >
                        <Select
                          value={String(owner)}
                          onValueChange={(v) => {
                            const t = Number(v);
                            if (t === defaultTeam && isOverridden) {
                              resetPick(pickNumber);
                            } else if (t !== owner) {
                              setPick(pickNumber, t);
                            }
                          }}
                        >
                          <SelectTrigger
                            className={`h-9 w-full rounded-none border-0 px-2 text-[11px] ${
                              isOverridden ? "font-black text-primary" : ""
                            }`}
                          >
                            <SelectValue>
                              <span className="block truncate">
                                {teamName(owner)}
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: teamCount }).map((_, ti) => {
                              const t = ti + 1;
                              return (
                                <SelectItem key={t} value={String(t)}>
                                  {teamName(t)}
                                  {t === defaultTeam && " (default)"}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
