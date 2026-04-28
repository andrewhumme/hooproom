import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ensureGuestSession } from "@/lib/guestSession";
import { AppHeader } from "@/components/AppHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerStatsModal } from "@/components/PlayerStatsModal";
import { type DraftablePlayer } from "@/lib/balldontlie";
import { fetchActivePlayersServer } from "@/lib/players.functions";
import { compareByRank } from "@/lib/playerRankings";
import { buildDraftCsv, downloadCsv } from "@/lib/draftExport";
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Download,
  Loader2,
  Play,
  Search,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/draft/$roomId")({
  component: DraftRoomPage,
  head: () => ({
    meta: [
      { title: "Draft Room — HoopRoom" },
      { name: "description", content: "Live snake draft room." },
    ],
  }),
});

type Room = {
  id: string;
  name: string;
  host_user_id: string;
  team_count: number;
  rounds: number;
  pick_clock_sec: number;
  scoring_format: string;
  status: "waiting" | "drafting" | "complete";
  current_pick_number: number;
  pick_deadline: string | null;
};

type Participant = {
  id: string;
  user_id: string;
  draft_position: number | null;
  team_name: string;
  joined_at: string;
};

type Pick = {
  id: string;
  pick_number: number;
  round: number;
  team_idx: number;
  user_id: string | null;
  player_id: string;
  player_name: string;
  player_position: string | null;
  player_team: string | null;
  was_autopick: boolean;
  picked_at: string;
};

function DraftRoomPage() {
  const { roomId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [players, setPlayers] = useState<DraftablePlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [statsPlayer, setStatsPlayer] = useState<DraftablePlayer | null>(null);

  const autopickFiredRef = useRef<number>(-1); // last pick_number autopick was attempted for

  // ------- Load room/participants/picks + subscribe -------
  useEffect(() => {
    let mounted = true;

    const loadAll = async () => {
      // Ensure a session before reading — RLS requires authenticated.
      await ensureGuestSession();
      const [r, p, pk] = await Promise.all([
        supabase.from("draft_rooms").select("*").eq("id", roomId).single(),
        supabase.from("draft_participants").select("*").eq("room_id", roomId),
        supabase.from("draft_picks").select("*").eq("room_id", roomId).order("pick_number"),
      ]);
      if (!mounted) return;
      if (r.error) {
        setError("Room not found");
        return;
      }
      setRoom(r.data as Room);
      setParticipants((p.data ?? []) as Participant[]);
      setPicks((pk.data ?? []) as Pick[]);
    };

    loadAll();

    const channel = supabase
      .channel(`draft-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.new && "id" in payload.new) setRoom(payload.new as Room);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_participants", filter: `room_id=eq.${roomId}` },
        async () => {
          const { data } = await supabase
            .from("draft_participants")
            .select("*")
            .eq("room_id", roomId);
          setParticipants((data ?? []) as Participant[]);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "draft_picks", filter: `room_id=eq.${roomId}` },
        (payload) => {
          setPicks((prev) => {
            const next = payload.new as Pick;
            if (prev.some((p) => p.id === next.id)) return prev;
            return [...prev, next].sort((a, b) => a.pick_number - b.pick_number);
          });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // ------- Load player pool when draft starts -------
  const playersFetchedRef = useRef(false);
  useEffect(() => {
    if (!room || room.status === "waiting") return;
    if (playersFetchedRef.current) return;
    playersFetchedRef.current = true;
    setPlayersLoading(true);

    let cancelled = false;
    const loadWithRetry = async () => {
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const list = await fetchActivePlayersServer();
          if (!cancelled) setPlayers(list);
          return;
        } catch (e) {
          console.error(`Player pool fetch attempt ${attempt} failed`, e);
          if (attempt === maxAttempts) {
            if (!cancelled) {
              setError("Failed to load player pool");
              playersFetchedRef.current = false;
            }
            return;
          }
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    };

    loadWithRetry().finally(() => {
      if (!cancelled) setPlayersLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [room]);

  // ------- Derived: participant-by-position, current slot, on-the-clock -------
  const meParticipant = useMemo(
    () => participants.find((p) => p.user_id === user?.id) ?? null,
    [participants, user?.id]
  );
  const isHost = room?.host_user_id === user?.id;
  const isJoined = !!meParticipant;

  const totalPicks = room ? room.team_count * room.rounds : 0;
  const currentPickNumber = room?.current_pick_number ?? 0;
  const isComplete = room?.status === "complete";
  const isDrafting = room?.status === "drafting";

  const { currentRound, currentTeamIdx } = useMemo(() => {
    if (!room || !isDrafting) return { currentRound: 0, currentTeamIdx: 0 };
    const r = Math.floor((currentPickNumber - 1) / room.team_count) + 1;
    const idxInRound = (currentPickNumber - 1) % room.team_count;
    const t = r % 2 === 1 ? idxInRound + 1 : room.team_count - idxInRound;
    return { currentRound: r, currentTeamIdx: t };
  }, [room, currentPickNumber, isDrafting]);

  const slotMap = useMemo(() => {
    const m = new Map<number, Participant>();
    for (const p of participants) {
      if (p.draft_position) m.set(p.draft_position, p);
    }
    return m;
  }, [participants]);

  const onTheClockParticipant = isDrafting ? slotMap.get(currentTeamIdx) ?? null : null;
  const isMyTurn = isDrafting && onTheClockParticipant?.user_id === user?.id;

  const takenIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);

  const availablePlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
      .filter((p) => !takenIds.has(p.id))
      .filter((p) => (posFilter === "ALL" ? true : (p.position || "").includes(posFilter)))
      .filter((p) =>
        q ? p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q) : true
      )
      .sort(compareByRank)
      .slice(0, 200);
  }, [players, takenIds, search, posFilter]);

  // ------- Pick clock countdown + autopick trigger -------
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  useEffect(() => {
    if (!room?.pick_deadline || !isDrafting) {
      setSecondsLeft(0);
      return;
    }
    const update = () => {
      const ms = new Date(room.pick_deadline!).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)));
    };
    update();
    const t = setInterval(update, 250);
    return () => clearInterval(t);
  }, [room?.pick_deadline, isDrafting]);

  // Autopick: when clock hits 0 OR current slot has no user (empty seat),
  // any client may trigger. Guard with autopickFiredRef to avoid duplicate calls
  // from the same client (other clients race-lose harmlessly via DB constraints).
  useEffect(() => {
    if (!room || !isDrafting) return;
    if (currentPickNumber > totalPicks) return;
    if (autopickFiredRef.current === currentPickNumber) return;

    // Autopick fires ONLY when the pick clock expires — empty seats wait the
    // full clock too, which keeps pacing realistic and prevents the UI from
    // thrashing through dozens of picks per second when most seats are empty.
    const clockExpired = secondsLeft <= 0 && !!room.pick_deadline;
    if (!clockExpired) return;
    if (!players.length) return; // wait until pool loaded

    const best = availablePlayers[0];
    if (!best) return;

    autopickFiredRef.current = currentPickNumber;
    supabase
      .rpc("make_pick", {
        _room_id: room.id,
        _player_id: best.id,
        _player_name: best.name,
        _player_position: best.position,
        _player_team: best.team,
        _autopick: true,
      })
      .then(({ error }) => {
        if (error) {
          // Reset so another client can retry — but only after small delay
          setTimeout(() => {
            if (autopickFiredRef.current === currentPickNumber) {
              autopickFiredRef.current = -1;
            }
          }, 1500);
        }
      });
  }, [
    room,
    isDrafting,
    secondsLeft,
    currentPickNumber,
    availablePlayers,
    players.length,
    totalPicks,
  ]);

  // ------- Actions -------
  const handleJoin = async () => {
    setActionBusy(true);
    setError(null);
    try {
      await ensureGuestSession();
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUser = sessionData.session?.user ?? user;
      if (!currentUser) throw new Error("Could not start guest session");
      const { error } = await supabase.from("draft_participants").insert({
        room_id: roomId,
        user_id: currentUser.id,
        team_name: (currentUser.user_metadata?.display_name as string) ?? "Team",
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join");
    } finally {
      setActionBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!user || !meParticipant) return;
    setActionBusy(true);
    const { error } = await supabase
      .from("draft_participants")
      .delete()
      .eq("id", meParticipant.id);
    setActionBusy(false);
    if (error) setError(error.message);
  };

  const handleStart = async () => {
    setActionBusy(true);
    setError(null);
    const { error } = await supabase.rpc("start_draft", { _room_id: roomId });
    setActionBusy(false);
    if (error) setError(error.message);
  };

  const handlePick = useCallback(
    async (player: DraftablePlayer) => {
      if (!isMyTurn || !room) return;
      setActionBusy(true);
      setError(null);
      const { error } = await supabase.rpc("make_pick", {
        _room_id: room.id,
        _player_id: player.id,
        _player_name: player.name,
        _player_position: player.position,
        _player_team: player.team,
        _autopick: false,
      });
      setActionBusy(false);
      if (error) setError(error.message);
    },
    [isMyTurn, room]
  );

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    if (!room) return;
    const teamNameByIdx = new Map<number, string>();
    for (const p of participants) {
      if (p.draft_position) teamNameByIdx.set(p.draft_position, p.team_name);
    }
    const rows = picks.map((pk) => ({
      pick_number: pk.pick_number,
      round: pk.round,
      team_idx: pk.team_idx,
      team_name: teamNameByIdx.get(pk.team_idx) ?? `Team ${pk.team_idx}`,
      player_name: pk.player_name,
      player_position: pk.player_position,
      player_team: pk.player_team,
      was_autopick: pk.was_autopick,
    }));
    const csv = buildDraftCsv(room.name, rows);
    const safe = room.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    downloadCsv(`${safe}_draft.csv`, csv);
  };

  // ------- Render: loading / not found / not authed -------
  if (authLoading || (!room && !error)) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader active="lobby" />
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader active="lobby" />
        <Card className="mx-auto mt-20 max-w-md p-8 text-center">
          <p className="text-lg font-black">{error}</p>
          <Button asChild variant="outline" className="mt-4 font-bold">
            <Link to="/lobby">
              <ArrowLeft /> Back to lobby
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (!room) return null;

  // ------- Render: WAITING ROOM -------
  if (room.status === "waiting") {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader active="lobby" />
        <main className="mx-auto max-w-4xl px-6 py-10">
          <Link
            to="/lobby"
            className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Lobby
          </Link>

          <div className="flex flex-col gap-2">
            <Badge variant="outline" className="w-fit font-bold">
              {room.scoring_format}
            </Badge>
            <h1 className="text-3xl font-black md:text-4xl">{room.name}</h1>
            <p className="text-sm text-muted-foreground">
              {room.team_count} teams · {room.rounds} rounds · {room.pick_clock_sec}s clock
            </p>
          </div>

          <Card className="mt-8 border-2 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Invite link
                </div>
                <div className="mt-1 font-mono text-sm break-all">{typeof window !== "undefined" ? window.location.href : ""}</div>
              </div>
              <Button onClick={handleCopyLink} variant="outline" size="sm" className="font-bold">
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </Card>

          <Card className="mt-6 border-2 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black">
                  Joined ({participants.length}/{room.team_count})
                </h2>
                <p className="text-sm text-muted-foreground">
                  {room.team_count - participants.length > 0
                    ? `${room.team_count - participants.length} open seat${room.team_count - participants.length === 1 ? "" : "s"} — empty seats will autodraft when the host starts.`
                    : "Room is full."}
                </p>
              </div>
            </div>

            <ul className="divide-y divide-border">
              {Array.from({ length: room.team_count }).map((_, i) => {
                const p = participants[i];
                return (
                  <li key={i} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-black">
                        {i + 1}
                      </span>
                      {p ? (
                        <span className="font-bold">{p.team_name}</span>
                      ) : (
                        <span className="text-sm italic text-muted-foreground">Open seat</span>
                      )}
                    </div>
                    {p && p.user_id === room.host_user_id && (
                      <Badge variant="secondary" className="font-bold">
                        Host
                      </Badge>
                    )}
                    {p && p.user_id === user?.id && p.user_id !== room.host_user_id && (
                      <Badge className="font-bold">You</Badge>
                    )}
                  </li>
                );
              })}
            </ul>

            {error && (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {!isJoined ? (
                <Button
                  onClick={handleJoin}
                  size="lg"
                  className="font-bold"
                  disabled={actionBusy || participants.length >= room.team_count}
                >
                  {actionBusy && <Loader2 className="animate-spin" />}
                  {participants.length >= room.team_count ? "Room full" : "Take a seat"}
                </Button>
              ) : (
                !isHost && (
                  <Button
                    onClick={handleLeave}
                    variant="outline"
                    size="lg"
                    className="font-bold"
                    disabled={actionBusy}
                  >
                    Leave room
                  </Button>
                )
              )}

              {isHost && (
                <Button
                  onClick={handleStart}
                  size="lg"
                  className="font-bold shadow-[var(--shadow-glow)]"
                  disabled={actionBusy || participants.length === 0}
                >
                  {actionBusy ? <Loader2 className="animate-spin" /> : <Play />}
                  Start draft
                </Button>
              )}
            </div>
          </Card>
        </main>
      </div>
    );
  }

  // ------- Render: DRAFTING / COMPLETE -------
  return (
    <div className="min-h-screen bg-background">
      <AppHeader active="lobby" />

      {/* Status bar */}
      <div className="border-b-2 border-border bg-secondary text-secondary-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/lobby"
              className="text-sm font-semibold text-secondary-foreground/70 hover:text-secondary-foreground"
            >
              <ArrowLeft className="inline h-4 w-4" /> Lobby
            </Link>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-primary">
                {isComplete ? "Draft complete" : `Round ${currentRound} · Pick ${currentPickNumber}`}
              </div>
              <div className="text-lg font-black">{room.name}</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isDrafting && (
              <>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <span
                    className={`text-2xl font-black tabular-nums ${secondsLeft <= 10 ? "text-destructive" : "text-primary"}`}
                  >
                    {String(Math.floor(secondsLeft / 60)).padStart(1, "0")}:
                    {String(secondsLeft % 60).padStart(2, "0")}
                  </span>
                </div>
                <div
                  className={`rounded-md border-2 px-3 py-1.5 text-sm font-black ${
                    isMyTurn
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card"
                  }`}
                >
                  {isMyTurn ? (
                    <>
                      <Zap className="mr-1 inline h-4 w-4" /> You're up
                    </>
                  ) : (
                    <>
                      On the clock:{" "}
                      <span className="text-primary">
                        {onTheClockParticipant?.team_name ?? `Team ${currentTeamIdx} (auto)`}
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
            {isComplete && (
              <Button onClick={handleExport} className="font-bold">
                <Download /> Export CSV
              </Button>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT — player pool */}
        <Card className="flex flex-col overflow-hidden border-2">
          <div className="border-b-2 border-border bg-muted/40 p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search players or teams…"
                  className="pl-9"
                />
              </div>
              <div className="flex gap-1 rounded-md border-2 border-border bg-card p-1">
                {(["ALL", "G", "F", "C"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPosFilter(p)}
                    className={`rounded-sm px-2 py-1 text-xs font-black ${
                      posFilter === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 text-xs font-semibold text-muted-foreground">
              {playersLoading
                ? "Loading player pool…"
                : `${availablePlayers.length} available · sorted by ranking`}
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {playersLoading && players.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {availablePlayers.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/50"
                  >
                    <button
                      type="button"
                      onClick={() => setStatsPlayer(p)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-80"
                      title="View season stats"
                    >
                      <PlayerAvatar name={p.name} team={p.team} nbaPlayerId={p.nbaPlayerId} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold underline-offset-2 hover:underline">
                          {p.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.team} · {p.position}
                        </div>
                      </div>
                    </button>
                    <Button
                      size="sm"
                      onClick={() => handlePick(p)}
                      disabled={!isMyTurn || actionBusy}
                      className="font-bold"
                      variant={isMyTurn ? "default" : "outline"}
                    >
                      Draft
                    </Button>
                  </li>
                ))}
                {availablePlayers.length === 0 && !playersLoading && (
                  <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No matching players.
                  </li>
                )}
              </ul>
            )}
          </div>
        </Card>

        {/* RIGHT — recent picks + teams */}
        <div className="flex flex-col gap-6">
          <Card className="border-2">
            <div className="border-b-2 border-border bg-muted/40 p-4">
              <h3 className="text-sm font-black uppercase tracking-widest">Recent picks</h3>
            </div>
            <ul className="max-h-[35vh] divide-y divide-border overflow-y-auto">
              {picks.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No picks yet.
                </li>
              ) : (
                picks
                  .slice()
                  .reverse()
                  .slice(0, 30)
                  .map((pk) => {
                    const team = slotMap.get(pk.team_idx);
                    return (
                      <li key={pk.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-muted-foreground">
                            R{pk.round} · #{pk.pick_number} ·{" "}
                            <span className="text-foreground">
                              {team?.team_name ?? `Team ${pk.team_idx}`}
                            </span>
                            {pk.was_autopick && (
                              <span className="ml-1 text-[10px] font-black uppercase text-primary">
                                auto
                              </span>
                            )}
                          </div>
                          <div className="truncate text-sm font-bold">{pk.player_name}</div>
                        </div>
                        <Badge variant="outline" className="font-bold">
                          {pk.player_team ?? "—"}
                        </Badge>
                      </li>
                    );
                  })
              )}
            </ul>
          </Card>

          <Card className="border-2">
            <div className="border-b-2 border-border bg-muted/40 p-4">
              <h3 className="text-sm font-black uppercase tracking-widest">
                <Users className="mr-1 inline h-4 w-4" /> Teams
              </h3>
            </div>
            <ul className="divide-y divide-border">
              {Array.from({ length: room.team_count }).map((_, i) => {
                const idx = i + 1;
                const team = slotMap.get(idx);
                const teamPicks = picks.filter((p) => p.team_idx === idx).length;
                const onClock = idx === currentTeamIdx && isDrafting;
                return (
                  <li
                    key={i}
                    className={`flex items-center justify-between px-4 py-2.5 ${
                      onClock ? "bg-primary/10" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-[10px] font-black">
                        {idx}
                      </span>
                      <span className="text-sm font-bold">
                        {team?.team_name ?? <span className="italic text-muted-foreground">Auto</span>}
                      </span>
                      {onClock && (
                        <span className="ml-1 text-[10px] font-black uppercase text-primary">
                          on clock
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-muted-foreground">
                      {teamPicks}/{room.rounds}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {isComplete && (
            <Card className="border-2 border-primary/40 bg-primary/5 p-6 text-center">
              <Trophy className="mx-auto h-8 w-8 text-primary" />
              <div className="mt-2 text-lg font-black">Draft complete!</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Export the results to import into your league platform.
              </p>
              <Button onClick={handleExport} className="mt-4 font-bold" size="lg">
                <Download /> Export CSV
              </Button>
            </Card>
          )}

          {error && isDrafting && (
            <Card className="border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
