import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ensureGuestSession } from "@/lib/guestSession";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerStatsModal } from "@/components/PlayerStatsModal";
import { AuctionRoom } from "@/components/AuctionRoom";
import { DraftQueuePanel } from "@/components/DraftQueuePanel";
import { RoomCommissionerTools } from "@/components/RoomCommissionerTools";
import { DraftControlPanel } from "@/components/DraftControlPanel";
import { useDraftQueue } from "@/hooks/useDraftQueue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { type DraftablePlayer } from "@/lib/balldontlie";
import { fetchActivePlayersServer } from "@/lib/players.functions";
import { fetchLatestStatsForPlayersServer, type PlayerSeasonStats } from "@/lib/playerStats.functions";
import { compareByRank } from "@/lib/playerRankings";
import { downloadDraftXlsx, type PickRow as ExportPickRow } from "@/lib/draftExport";
import { assignPicksToSlots, buildSlotSpots, totalSlots, type SlotConfig } from "@/lib/rosterSlots";
import { formatDuration } from "@/lib/utils";
import {
  ArrowDown,
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Download,
  Loader2,
  Pause,
  Play,
  Plus,
  Search,
  Star,
  Trophy,
  Users,
  XCircle,
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
  status: "waiting" | "drafting" | "paused" | "complete";
  current_pick_number: number;
  pick_deadline: string | null;
  paused_at: string | null;
  draft_format: string;
  auction_budget: number;
  auction_min_bid: number;
  auction_bid_clock_sec: number;
  auction_antisnipe_threshold_sec: number | null;
  auction_max_concurrent_nominations: number;
  auction_concurrent_per_team: number | null;
  auction_nominations_per_team: number | null;
  slots_pg: number;
  slots_sg: number;
  slots_g: number;
  slots_sf: number;
  slots_pf: number;
  slots_f: number;
  slots_c: number;
  slots_flx: number;
  slots_bn: number;
  reversal_rounds: number[] | null;
  auto_start_at: string | null;
};

type Participant = {
  id: string;
  user_id: string;
  draft_position: number | null;
  team_name: string;
  joined_at: string;
  is_bot?: boolean;
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
  auction_price: number | null;
};

type StatKey = "pts" | "reb" | "ast" | "stl" | "blk" | "fg3_made" | "fg_pct" | "ft_pct";
type SortKey = "rank" | StatKey;

const STAT_COLUMNS: { key: StatKey; label: string; decimals: number }[] = [
  { key: "pts", label: "PTS", decimals: 1 },
  { key: "reb", label: "REB", decimals: 1 },
  { key: "ast", label: "AST", decimals: 1 },
  { key: "stl", label: "STL", decimals: 1 },
  { key: "blk", label: "BLK", decimals: 1 },
  { key: "fg3_made", label: "3PM", decimals: 1 },
  { key: "fg_pct", label: "FG%", decimals: 3 },
  { key: "ft_pct", label: "FT%", decimals: 3 },
];

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
  const [latestStats, setLatestStats] = useState<Record<string, PlayerSeasonStats>>({});
  const [viewingTeamIdx, setViewingTeamIdx] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<"players" | "myteam" | "teams">("players");
  const [statsShade, setStatsShade] = useState<"zebra" | "heatmap">("zebra");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

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
    if (!room) return;
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

  // Bulk-load most recent season stats for the loaded player pool
  useEffect(() => {
    if (players.length === 0) return;
    let cancelled = false;
    const keys = players.map((p) => p.id);
    fetchLatestStatsForPlayersServer({ data: { playerKeys: keys } })
      .then((map) => {
        if (!cancelled) setLatestStats(map);
      })
      .catch((e) => console.error("latest stats fetch failed", e));
    return () => {
      cancelled = true;
    };
  }, [players]);

  // ------- Derived: participant-by-position, current slot, on-the-clock -------
  const meParticipant = useMemo(
    () => participants.find((p) => p.user_id === user?.id) ?? null,
    [participants, user?.id]
  );
  const isHost = room?.host_user_id === user?.id;
  const isJoined = !!meParticipant;

  const currentPickNumber = room?.current_pick_number ?? 0;
  const isComplete = room?.status === "complete";
  const isDrafting = room?.status === "drafting";
  const isPaused = room?.status === "paused";

  const { currentRound, currentTeamIdx, currentReverse } = useMemo(() => {
    if (!room || !isDrafting) return { currentRound: 0, currentTeamIdx: 0, currentReverse: false };
    const r = Math.floor((currentPickNumber - 1) / room.team_count) + 1;
    const idxInRound = (currentPickNumber - 1) % room.team_count;
    const reversals = new Set<number>(room.reversal_rounds ?? []);
    // Walk rounds 1..r-1 to determine direction at round r
    let reverse = false;
    for (let i = 1; i < r; i++) {
      // Skip the flip going INTO round (i + 1) if that round is a reversal
      // round (the "double pick" turn keeps direction the same as the prior round).
      if (!reversals.has(i + 1)) reverse = !reverse;
    }
    const t = reverse ? room.team_count - idxInRound : idxInRound + 1;
    return { currentRound: r, currentTeamIdx: t, currentReverse: reverse };
  }, [room, currentPickNumber, isDrafting]);

  const slotMap = useMemo(() => {
    const m = new Map<number, Participant>();
    for (const p of participants) {
      if (p.draft_position) m.set(p.draft_position, p);
    }
    return m;
  }, [participants]);

  const slotCfg: SlotConfig | null = useMemo(() => {
    if (!room) return null;
    return {
      PG: room.slots_pg,
      SG: room.slots_sg,
      G: room.slots_g ?? 0,
      SF: room.slots_sf,
      PF: room.slots_pf,
      F: room.slots_f ?? 0,
      C: room.slots_c,
      FLX: room.slots_flx,
      BN: room.slots_bn,
    };
  }, [room]);
  const rosterSlotCount = useMemo(
    () => (slotCfg ? totalSlots(slotCfg) : room?.rounds ?? 0),
    [slotCfg, room?.rounds],
  );
  const totalPicks = room ? room.team_count * rosterSlotCount : 0;

  const onTheClockParticipant = isDrafting ? slotMap.get(currentTeamIdx) ?? null : null;
  const isMyTurn = isDrafting && onTheClockParticipant?.user_id === user?.id;

  const takenIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);

  // Per-user draft queue. Realtime-synced; used as autopick source by the
  // server tick when the clock expires.
  const queueApi = useDraftQueue(roomId, user?.id ?? null);
  const queuedIds = useMemo(
    () => new Set(queueApi.queue.map((q) => q.player_id)),
    [queueApi.queue],
  );
  const isSlow = !!room && room.pick_clock_sec >= 3600;

  const availablePlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = players
      .filter((p) => !takenIds.has(p.id))
      .filter((p) => (posFilter === "ALL" ? true : (p.position || "").includes(posFilter)))
      .filter((p) =>
        q ? p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q) : true
      );

    if (sortKey === "rank") {
      filtered.sort(compareByRank);
    } else {
      const dir = sortDir === "asc" ? 1 : -1;
      filtered.sort((a, b) => {
        const sa = latestStats[a.id];
        const sb = latestStats[b.id];
        const va = sa ? (sa[sortKey] as number | null | undefined) : null;
        const vb = sb ? (sb[sortKey] as number | null | undefined) : null;
        // Missing values always sort to the bottom regardless of direction.
        if (va == null && vb == null) return compareByRank(a, b);
        if (va == null) return 1;
        if (vb == null) return -1;
        if (va === vb) return compareByRank(a, b);
        return (va < vb ? -1 : 1) * dir;
      });
    }
    return filtered.slice(0, 200);
  }, [players, takenIds, search, posFilter, sortKey, sortDir, latestStats]);

  // Per-stat max across visible players (for heatmap shading).
  const statMax = useMemo(() => {
    const keys = ["pts", "reb", "ast", "stl", "blk", "fg3_made", "fg_pct", "ft_pct"] as const;
    const max: Record<string, number> = {};
    for (const k of keys) max[k] = 0;
    for (const p of availablePlayers) {
      const s = latestStats[p.id];
      if (!s) continue;
      for (const k of keys) {
        const v = s[k as keyof typeof s] as number | null | undefined;
        if (v != null && v > max[k]) max[k] = v;
      }
    }
    return max;
  }, [availablePlayers, latestStats]);

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

  // Bots are now added automatically when the draft starts (manually by the
  // host or via the lobby auto-start timer). The host can still remove a bot
  // seat before the draft starts via handleRemoveBot below.


  const handleRemoveBot = async (participantId: string) => {
    setActionBusy(true);
    setError(null);
    const { error } = await supabase.rpc("remove_bot_seat", { _participant_id: participantId });
    setActionBusy(false);
    if (error) setError(error.message);
  };

  const handleClaimSlot = async (participantId: string, slot: number) => {
    setActionBusy(true);
    setError(null);
    const { error } = await supabase.rpc("claim_draft_position", {
      _participant_id: participantId,
      _new_position: slot,
    });
    setActionBusy(false);
    if (error) setError(error.message);
  };

  const handleRandomizeOrder = async () => {
    setActionBusy(true);
    setError(null);
    const { error } = await supabase.rpc("host_randomize_positions", { _room_id: roomId });
    setActionBusy(false);
    if (error) setError(error.message);
  };


  const handleStart = async () => {
    setActionBusy(true);
    setError(null);
    // Fills any empty seats with bots and starts the draft (snake or auction).
    const { error } = await supabase.rpc("host_start_with_bots", { _room_id: roomId });
    setActionBusy(false);
    if (error) setError(error.message);
  };

  const handlePauseToggle = async () => {
    if (!room) return;
    setActionBusy(true);
    setError(null);
    const rpcName = room.status === "paused" ? "resume_draft" : "pause_draft";
    const { error } = await supabase.rpc(rpcName, { _room_id: room.id });
    setActionBusy(false);
    if (error) setError(error.message);
  };

  const handleEndDraft = async () => {
    if (!room) return;
    setActionBusy(true);
    setError(null);
    const { error } = await supabase
      .from("draft_rooms")
      .update({ status: "complete", completed_at: new Date().toISOString(), pick_deadline: null })
      .eq("id", room.id);
    setActionBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate({ to: "/lobby" });
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
    const rows: ExportPickRow[] = picks.map((pk) => ({
      pick_number: pk.pick_number,
      round: pk.round,
      team_idx: pk.team_idx,
      team_name: teamNameByIdx.get(pk.team_idx) ?? `Team ${pk.team_idx}`,
      player_name: pk.player_name,
      player_position: pk.player_position,
      player_team: pk.player_team,
      was_autopick: pk.was_autopick,
    }));
    downloadDraftXlsx(
      {
        roomName: room.name,
        draftFormat: room.draft_format,
        scoringFormat: room.scoring_format,
        teamCount: room.team_count,
        rounds: room.rounds,
        pickClockSec: room.pick_clock_sec,
      },
      rows,
    );
  };

  // ------- Render: loading / not found / not authed -------
  if (authLoading || (!room && !error)) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="min-h-screen bg-background">
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

  // Auction formats use a dedicated room UI for drafting/complete states.
  // The waiting room (lobby) is shared with the snake-draft UI below.
  const isAuctionFormat =
    room.draft_format === "auction" || room.draft_format === "auction_slow";
  if (isAuctionFormat && room.status !== "waiting") {
    return (
      <AuctionRoom
        room={room}
        userId={user?.id}
        participants={participants}
        picks={picks}
      />
    );
  }

  if (room.status === "waiting") {
    return (
      <div className="min-h-screen bg-background">
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
              {room.team_count} teams · {rosterSlotCount} rounds · {formatDuration(room.pick_clock_sec)} clock
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

          {room.auto_start_at && (
            <LobbyCountdown deadline={room.auto_start_at} />
          )}

          <Card className="mt-6 border-2 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black">
                  Joined ({participants.length}/{room.team_count})
                </h2>
                <p className="text-sm text-muted-foreground">
                  {room.team_count - participants.length > 0
                    ? `${room.team_count - participants.length} open seat${room.team_count - participants.length === 1 ? "" : "s"} — empty seats will fill with bots when the draft starts.`
                    : "Room is full."}
                </p>
              </div>
            </div>


            {isHost && (
              <div className="mb-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="font-bold"
                  disabled={actionBusy || participants.length === 0}
                  onClick={handleRandomizeOrder}
                >
                  <Zap className="h-4 w-4" /> Randomize order
                </Button>
              </div>
            )}

            <ul className="divide-y divide-border">
              {Array.from({ length: room.team_count }).map((_, i) => {
                const slot = (i + 1) as number;
                const p = participants.find((x) => x.draft_position === slot);
                const isMe = p?.user_id === user?.id;
                const dragProps = isHost && p
                  ? {
                      draggable: true,
                      onDragStart: (e: React.DragEvent) => {
                        e.dataTransfer.setData("text/plain", p.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragOverSlot(null);
                      },
                      onDragEnd: () => setDragOverSlot(null),
                    }
                  : {};
                const dropProps = isHost
                  ? {
                      onDragOver: (e: React.DragEvent) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverSlot(slot);
                      },
                      onDrop: (e: React.DragEvent) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/plain");
                        setDragOverSlot(null);
                        if (id) handleClaimSlot(id, slot);
                      },
                    }
                  : {};
                const isDropTarget = dragOverSlot === slot;
                return (
                  <li
                    key={slot}
                    className={`relative flex items-center justify-between py-3 px-2 -mx-2 rounded-md ${isHost && p ? "cursor-grab active:cursor-grabbing" : ""} ${isHost ? "hover:bg-muted/40" : ""}`}
                    {...dragProps}
                    {...dropProps}
                  >
                    {isDropTarget && (
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary" />
                    )}
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-black">
                        {slot}
                      </span>
                      {p ? (
                        <span className="font-bold">{p.team_name}</span>
                      ) : (
                        <span className="text-sm italic text-muted-foreground">Open seat</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {p && p.user_id === room.host_user_id && (
                        <Badge variant="secondary" className="font-bold">Host</Badge>
                      )}
                      {p && isMe && p.user_id !== room.host_user_id && (
                        <Badge className="font-bold">You</Badge>
                      )}
                      {p?.is_bot && (
                        <Badge variant="outline" className="font-bold">Bot</Badge>
                      )}
                      {!p && isJoined && meParticipant && meParticipant.draft_position !== slot && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs font-bold"
                          disabled={actionBusy}
                          onClick={() => handleClaimSlot(meParticipant.id, slot)}
                        >
                          Move here
                        </Button>
                      )}
                      {p?.is_bot && isHost && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                          disabled={actionBusy}
                          onClick={() => handleRemoveBot(p.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {isHost && participants.length > 1 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Drag any team to a different slot to reorder the draft. Joiners can claim open seats themselves.
              </p>
            )}


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
            </div>
          </Card>

          {isHost && (
            <RoomCommissionerTools
              roomId={roomId}
              teamCount={room.team_count}
              rounds={room.rounds}
              reversalRounds={room.reversal_rounds ?? []}
              draftFormat={room.draft_format}
              participants={participants.map((p) => ({
                id: p.id,
                team_name: p.team_name,
                is_bot: p.is_bot,
                draft_position: p.draft_position,
              }))}
              players={players}
            />
          )}

          {isHost && (
            <Card className="mt-6 border-2 p-6">
              <div className="mb-3">
                <h2 className="text-lg font-black">Start the draft</h2>
                <p className="text-sm text-muted-foreground">
                  When you're ready, kick off the draft. Empty seats will fill
                  with bots automatically.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleStart}
                  size="lg"
                  className="font-bold shadow-[var(--shadow-glow)]"
                  disabled={actionBusy || participants.length === 0}
                >
                  {actionBusy ? <Loader2 className="animate-spin" /> : <Play />}
                  Start draft
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="lg"
                      className="font-bold border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      disabled={actionBusy}
                    >
                      <XCircle /> End draft
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>End this draft?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This closes the room and removes it from the active lobby. Since the draft hasn't started, no picks will be recorded. This can't be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleEndDraft}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        End draft
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </Card>
          )}
        </main>
      </div>
    );
  }

  // ------- Render: DRAFTING / COMPLETE -------
  return (
    <div className="min-h-screen bg-background">

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
                    {formatDuration(secondsLeft)}
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
            {isPaused && (
              <div className="rounded-md border-2 border-amber-500/60 bg-amber-500/10 px-3 py-1.5 text-sm font-black uppercase tracking-widest text-amber-600">
                <Pause className="mr-1 inline h-4 w-4" /> Paused by commissioner
              </div>
            )}
            {isComplete && (
              <Button onClick={handleExport} className="font-bold">
                <Download /> Export XLSX
              </Button>
            )}
            {isHost && (isDrafting || isPaused) && (
              <DraftControlPanel
                roomId={room.id}
                isDrafting={isDrafting}
                isAuction={false}
                canForceSkip={isDrafting}
                recentPicks={[...picks]
                  .sort((a, b) => b.pick_number - a.pick_number)
                  .map((p) => ({
                    id: p.id,
                    pick_number: p.pick_number,
                    team_idx: p.team_idx,
                    player_name: p.player_name,
                    team_name:
                      slotMap.get(p.team_idx)?.team_name ?? `Team ${p.team_idx}`,
                  }))}
                availablePlayers={players.filter((p) => !takenIds.has(p.id))}
              />
            )}
            {isHost && (isDrafting || isPaused) && (
              <Button
                onClick={handlePauseToggle}
                variant="secondary"
                size="sm"
                className="font-bold border-2 border-secondary"
                disabled={actionBusy}
              >
                {isPaused ? <><Play /> Resume</> : <><Pause /> Pause</>}
              </Button>
            )}
            {isHost && !isComplete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-bold border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    disabled={actionBusy}
                  >
                    <XCircle /> End draft
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>End this draft?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This marks the room as complete and removes it from the active lobby. Picks made so far stay in the record and remain exportable. This can't be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleEndDraft}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      End draft
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {/* Draft order strip — shows pick order, highlights current team */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              <Users className="mr-1 inline h-3.5 w-3.5" /> Draft order
            </h3>
            {isDrafting && (
              <span className="text-[11px] font-bold text-muted-foreground">
                Round {currentRound} {currentReverse ? "← reverse" : "→ forward"}
                {(room.reversal_rounds ?? []).includes(currentRound) && (
                  <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary">
                    Reversal
                  </span>
                )}
              </span>
            )}
          </div>
          <div
            className="flex gap-2 overflow-x-auto pb-2 -mx-6 px-6 snap-x snap-mandatory lg:mx-0 lg:px-0 lg:grid lg:gap-1.5 lg:pb-1 lg:overflow-visible lg:snap-none"
            style={{
              ["--lg-cols" as string]: `repeat(${room.team_count}, minmax(0, 1fr))`,
              gridTemplateColumns: `var(--lg-cols)`,
            }}
          >
            {Array.from({ length: room.team_count }).map((_, i) => {
              const idx = i + 1;
              const team = slotMap.get(idx);
              const teamPicks = picks.filter((p) => p.team_idx === idx).length;
              const onClock = idx === currentTeamIdx && isDrafting;
              const isMe = team?.user_id === user?.id;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setViewingTeamIdx(idx)}
                  className={`flex w-[110px] shrink-0 snap-start flex-col items-start gap-1 rounded-md border-2 px-2 py-2 text-left transition hover:-translate-y-0.5 lg:w-auto lg:min-w-0 lg:shrink lg:px-1.5 lg:py-1.5 lg:gap-0.5 ${
                    onClock
                      ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                      : isMe
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-black lg:h-4 lg:w-4 lg:text-[9px] ${
                        onClock ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-foreground"
                      }`}
                    >
                      {idx}
                    </span>
                    {onClock && (
                      <span className="truncate text-[9px] font-black uppercase tracking-wider lg:text-[8px]">
                        On clock
                      </span>
                    )}
                    {!onClock && isMe && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-primary lg:text-[8px]">
                        You
                      </span>
                    )}
                  </div>
                  <div className="w-full truncate text-[12px] font-black leading-tight lg:text-[11px]">
                    {team?.team_name ?? <span className="italic opacity-70">Auto</span>}
                  </div>
                  <div
                    className={`text-[10px] font-bold lg:text-[9px] ${
                      onClock ? "text-primary-foreground/80" : "text-muted-foreground"
                    }`}
                  >
                    {teamPicks}/{rosterSlotCount}
                  </div>
                </button>
              );
            })}
          </div>

        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[1fr_360px]">
        {/* Mobile-only tab switcher */}
        <Tabs
          value={mobileTab}
          onValueChange={(v) => setMobileTab(v as typeof mobileTab)}
          className="lg:hidden lg:col-span-full"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="players">Players</TabsTrigger>
            <TabsTrigger value="myteam">My Team</TabsTrigger>
            <TabsTrigger value="teams">Teams</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* LEFT — player pool */}
        <Card
          className={`flex-col overflow-hidden border-2 lg:flex lg:h-[calc(100vh-6rem)] lg:max-h-[calc(100vh-6rem)] lg:sticky lg:top-4 ${
            mobileTab === "players" ? "flex" : "hidden"
          }`}
        >
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
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-muted-foreground">
                {playersLoading
                  ? "Loading player pool…"
                  : `${availablePlayers.length} available · sorted by ranking`}
              </div>
              <div className="flex items-center gap-1 rounded-md border-2 border-border bg-card p-1">
                {(["zebra", "heatmap"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setStatsShade(m)}
                    className={`rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-wider ${
                      statsShade === m
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-[60vh] overflow-y-auto lg:h-auto lg:min-h-0 lg:flex-1">
            {playersLoading && players.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="sticky top-0 z-10 hidden items-center gap-3 border-b-2 border-border bg-card px-4 py-2 sm:flex">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortKey === "rank") {
                        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      } else {
                        setSortKey("rank");
                        setSortDir("asc");
                      }
                    }}
                    className={`min-w-0 flex-1 text-left text-[10px] font-black uppercase tracking-wider ${
                      sortKey === "rank" ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Player {sortKey === "rank" ? <ArrowDown className="ml-0.5 inline-block h-3 w-3 text-orange-500" /> : ""}
                  </button>
                  <div className="flex shrink-0 items-stretch rounded-md border border-border/70 bg-muted/20">
                    {STAT_COLUMNS.map((col, idx) => {
                      const active = sortKey === col.key;
                      return (
                        <button
                          key={col.key}
                          type="button"
                          onClick={() => {
                            if (active) {
                              setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            } else {
                              setSortKey(col.key);
                              setSortDir("desc");
                            }
                          }}
                          className={`flex w-11 flex-col items-center px-1 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                            idx === 0 ? "" : "border-l border-border/70"
                          } ${
                            active
                              ? "bg-primary/15 text-primary"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          title={`Sort by ${col.label}`}
                        >
                          <span>{col.label}</span>
                          <span className="text-[9px] leading-none">
                            {active ? <ArrowDown className="h-3 w-3 text-orange-500" /> : <ArrowDown className="h-3 w-3 opacity-20" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="w-[104px] shrink-0" />
                </div>
                <ul className="divide-y divide-border">
                {availablePlayers.map((p, idx) => {
                  const s = latestStats[p.id];
                  const zebra = statsShade === "zebra" && idx % 2 === 1 ? "bg-muted/40" : "";
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center justify-between gap-3 px-4 py-1 hover:bg-muted/60 ${zebra}`}
                    >
                      <button
                        type="button"
                        onClick={() => setStatsPlayer(p)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left transition hover:opacity-80"
                        title="View season stats"
                      >
                        <PlayerAvatar name={p.name} team={p.team} nbaPlayerId={p.nbaPlayerId} shape="square" size={26} />
                        <div className="min-w-0 leading-tight">
                          <div className="truncate text-xs font-bold underline-offset-2 hover:underline">
                            {p.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {p.team} · {p.position}
                          </div>
                        </div>
                      </button>

                      <div className="hidden shrink-0 items-stretch rounded-md border border-border/70 bg-background/70 text-[11px] font-bold tabular-nums sm:flex">
                        {STAT_COLUMNS.map((col, idx) => (
                          <Stat
                            key={col.key}
                            label={col.label}
                            value={s?.[col.key] as number | null | undefined}
                            max={statMax[col.key]}
                            mode={statsShade}
                            decimals={col.decimals}
                            active={sortKey === col.key}
                            divider={idx !== 0}
                          />
                        ))}
                      </div>

                      <div className="flex w-[104px] shrink-0 items-center justify-end gap-1">
                        {isJoined && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() =>
                              queuedIds.has(p.id)
                                ? queueApi.remove(p.id)
                                : queueApi.add({
                                    id: p.id,
                                    name: p.name,
                                    position: p.position,
                                    team: p.team,
                                  })
                            }
                            title={queuedIds.has(p.id) ? "Remove from queue" : "Add to queue"}
                          >
                            {queuedIds.has(p.id) ? (
                              <Star className="h-4 w-4 fill-primary text-primary" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => handlePick(p)}
                          disabled={!isMyTurn || actionBusy}
                          className="h-7 px-2.5 text-xs font-bold"
                          variant={isMyTurn ? "default" : "outline"}
                        >
                          Draft
                        </Button>
                      </div>
                    </li>
                  );
                })}
                {availablePlayers.length === 0 && !playersLoading && (
                  <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No matching players.
                  </li>
                )}
              </ul>
              </>
            )}
          </div>
        </Card>

        {/* RIGHT — your team + recent picks + teams */}
        <div
          className={`flex-col gap-6 lg:flex ${
            mobileTab === "players" ? "hidden" : "flex"
          }`}
        >
          {slotCfg && (
            <Card
              className={`border-2 border-primary/40 lg:block ${
                mobileTab === "myteam" ? "block" : "hidden"
              }`}
            >
              <div className="border-b-2 border-border bg-primary/10 p-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-primary">
                  Your Team{meParticipant ? ` — ${meParticipant.team_name}` : ""}
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                  {meParticipant
                    ? `${picks.filter((p) => p.user_id === user?.id).length}/${rosterSlotCount} slots filled`
                    : "Spectating — join a seat to draft players"}
                </p>
              </div>
              <RosterSlotList
                picks={
                  meParticipant
                    ? picks
                        .filter((p) => p.user_id === user?.id)
                        .sort((a, b) => a.pick_number - b.pick_number)
                    : []
                }
                cfg={slotCfg}
                teamCount={room.team_count}
              />
            </Card>
          )}


          {isJoined && (
            <div
              className={`lg:block ${
                mobileTab === "myteam" ? "block" : "hidden"
              }`}
            >
              <DraftQueuePanel
                queue={queueApi.queue}
                takenIds={takenIds}
                onRemove={queueApi.remove}
                onMoveUp={queueApi.moveUp}
                onMoveDown={queueApi.moveDown}
                isSlow={isSlow}
              />
            </div>
          )}

          <Card className={`border-2 lg:block ${mobileTab === "teams" ? "block" : "hidden"}`}>
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
                            R{pk.round} · Pick {pickInRound(pk, room.team_count)} (#{pk.pick_number}) ·{" "}
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

          <Card
            className={`border-2 lg:block ${
              mobileTab === "teams" ? "block" : "hidden"
            }`}
          >
            <div className="border-b-2 border-border bg-muted/40 p-4">
              <h3 className="text-sm font-black uppercase tracking-widest">
                <Users className="mr-1 inline h-4 w-4" /> Teams
              </h3>
              <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                Tap a team to view their picks
              </p>
            </div>
            <ul className="max-h-[40vh] divide-y divide-border overflow-y-auto">
              {Array.from({ length: room.team_count }).map((_, i) => {
                const idx = i + 1;
                const team = slotMap.get(idx);
                const teamPicks = picks.filter((p) => p.team_idx === idx).length;
                const onClock = idx === currentTeamIdx && isDrafting;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setViewingTeamIdx(idx)}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition hover:bg-muted/60 ${
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
                        {team?.user_id === user?.id && (
                          <Badge className="ml-1 font-bold">You</Badge>
                        )}
                        {onClock && (
                          <span className="ml-1 text-[10px] font-black uppercase text-primary">
                            on clock
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-muted-foreground">
                        {teamPicks}/{rosterSlotCount}
                      </span>
                    </button>
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
                View the full summary or export to your league platform.
              </p>
              <div className="mt-4 flex flex-col items-stretch gap-2">
                <Button asChild className="font-bold" size="lg">
                  <Link to="/draft/$roomId/summary" params={{ roomId }}>
                    <Trophy /> View summary
                  </Link>
                </Button>
                <Button onClick={handleExport} variant="outline" className="font-bold">
                  <Download /> Export XLSX
                </Button>
              </div>
            </Card>
          )}

          {error && isDrafting && (
            <Card className="border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </Card>
          )}
        </div>
      </main>

      <PlayerStatsModal
        open={!!statsPlayer}
        onOpenChange={(o) => !o && setStatsPlayer(null)}
        player={
          statsPlayer
            ? {
                id: statsPlayer.id,
                name: statsPlayer.name,
                team: statsPlayer.team,
                position: statsPlayer.position,
                nbaPlayerId: statsPlayer.nbaPlayerId ?? null,
              }
            : null
        }
        canDraft={isMyTurn && !!statsPlayer && !takenIds.has(statsPlayer.id)}
        draftBusy={actionBusy}
        showQueue={isJoined}
        isQueued={!!statsPlayer && queuedIds.has(statsPlayer.id)}
        onDraft={
          statsPlayer
            ? () => {
                handlePick(statsPlayer);
                setStatsPlayer(null);
              }
            : undefined
        }
        onToggleQueue={
          statsPlayer
            ? () => {
                if (queuedIds.has(statsPlayer.id)) {
                  queueApi.remove(statsPlayer.id);
                } else {
                  queueApi.add({
                    id: statsPlayer.id,
                    name: statsPlayer.name,
                    position: statsPlayer.position,
                    team: statsPlayer.team,
                  });
                }
              }
            : undefined
        }
      />

      <Dialog open={viewingTeamIdx !== null} onOpenChange={(o) => !o && setViewingTeamIdx(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
          {viewingTeamIdx !== null && (() => {
            const team = slotMap.get(viewingTeamIdx);
            const teamPicks = picks.filter((p) => p.team_idx === viewingTeamIdx);
            return (
              <>
                <DialogHeader className="shrink-0">
                  <DialogTitle className="text-lg font-black">
                    {team?.team_name ?? `Team ${viewingTeamIdx} (Auto)`}
                  </DialogTitle>
                  <DialogDescription>
                    Slot #{viewingTeamIdx} · {teamPicks.length}/{rosterSlotCount} picks
                  </DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
                  {teamPicks.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      No picks yet.
                    </div>
                  ) : slotCfg ? (
                    <RosterSlotList
                      picks={teamPicks.slice().sort((a, b) => a.pick_number - b.pick_number)}
                      cfg={slotCfg}
                      teamCount={room.team_count}
                    />
                  ) : null}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  max,
  mode,
  decimals = 1,
  active = false,
  divider = false,
}: {
  label: string;
  value: number | null | undefined;
  max?: number;
  mode?: "zebra" | "heatmap";
  decimals?: number;
  active?: boolean;
  divider?: boolean;
}) {
  // Heatmap: shade cell background based on value/max ratio.
  let style: React.CSSProperties | undefined;
  if (mode === "heatmap" && value != null && max && max > 0) {
    const ratio = Math.min(1, Math.max(0, Number(value) / max));
    const alpha = 0.1 + ratio * 0.55;
    style = {
      backgroundColor: `color-mix(in oklab, var(--primary) ${(alpha * 100).toFixed(0)}%, transparent)`,
    };
  }
  const formatted =
    value == null
      ? "—"
      : decimals === 3
        ? Number(value).toFixed(3).replace(/^0\./, ".")
        : Number(value).toFixed(decimals);
  return (
    <div
      className={`flex w-11 flex-col items-center px-1 py-0.5 leading-tight ${
        divider ? "border-l border-border/70" : ""
      } ${
        active && mode !== "heatmap" ? "ring-1 ring-primary/40" : ""
      }`}
      style={style}
    >
      <span className={active ? "text-primary" : "text-foreground"}>{formatted}</span>
      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

// Pick number within its round (1..team_count). Overall pick is pk.pick_number.
function pickInRound(pk: { pick_number: number }, teamCount: number) {
  return ((pk.pick_number - 1) % teamCount) + 1;
}

function RosterSlotList({
  picks,
  cfg,
  teamCount,
}: {
  picks: Pick[];
  cfg: SlotConfig;
  teamCount: number;
}) {
  const spots = buildSlotSpots(cfg);
  const assigned = assignPicksToSlots(picks, cfg);
  const bySpot = new Map<string, Pick>();
  const overflow: Pick[] = [];
  for (const a of assigned) {
    if (a.spotKey) bySpot.set(a.spotKey, a.pick);
    else overflow.push(a.pick);
  }
  return (
    <ul className="divide-y divide-border">
      {spots.map((spot) => {
        const pk = bySpot.get(spot.key);
        return (
          <li key={spot.key} className="flex items-center gap-3 px-4 py-2.5">
            <span
              className={`flex h-8 w-10 shrink-0 items-center justify-center rounded-md text-[10px] font-black ${
                spot.pos === "FLX"
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {spot.pos}
            </span>
            <div className="min-w-0 flex-1">
              {pk ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-bold">{pk.player_name}</div>
                    <Badge variant="outline" className="shrink-0 font-bold">
                      {pk.player_team ?? "—"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {pk.player_position ?? "—"} · R{pk.round} · Pick{" "}
                    {pickInRound(pk, teamCount)} (#{pk.pick_number})
                    {pk.was_autopick && (
                      <span className="ml-1 text-[10px] font-black uppercase text-primary">
                        auto
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-xs italic text-muted-foreground">Empty · {spot.pos}</div>
              )}
            </div>
          </li>
        );
      })}
      {overflow.map((pk) => (
        <li key={pk.id} className="flex items-center gap-3 bg-destructive/5 px-4 py-2.5">
          <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md bg-destructive/20 text-[10px] font-black text-destructive">
            BN
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-sm font-bold">{pk.player_name}</div>
              <Badge variant="outline" className="shrink-0 font-bold">
                {pk.player_team ?? "—"}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {pk.player_position ?? "—"} · R{pk.round} · Pick{" "}
              {pickInRound(pk, teamCount)} (#{pk.pick_number}) · overflow
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}


function LobbyCountdown({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(deadline).getTime() - now;
  const expired = ms <= 0;
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const label = formatDuration(totalSec);
  return (
    <Card className="mt-6 border-2 border-primary/40 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-primary">
            Lobby auto-start
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {expired
              ? "Starting any moment — empty seats are being filled with bots."
              : "When this timer hits zero, any open seats fill with bots and the draft begins."}
          </p>
        </div>
        <div className="font-mono text-xl font-black text-primary tabular-nums">
          {expired ? "Starting…" : label}
        </div>
      </div>
    </Card>
  );
}
