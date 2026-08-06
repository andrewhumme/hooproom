import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { DraftControlPanel } from "@/components/DraftControlPanel";
import { PlayerStatsModal } from "@/components/PlayerStatsModal";
import { supabase } from "@/integrations/supabase/client";
import { fetchActivePlayersServer } from "@/lib/players.functions";
import { getAuctionValuesServer } from "@/lib/auctionValues.functions";
import type { DraftablePlayer } from "@/lib/balldontlie";
import { compareByRank } from "@/lib/playerRankings";
import { downloadDraftXlsx, type PickRow as ExportPickRow } from "@/lib/draftExport";
import {
  fetchLatestStatsForPlayersServer,
  type PlayerSeasonStats,
} from "@/lib/playerStats.functions";
import {
  CategoryHeatmap,
  computeTeamTotals,
  StatCell,
  STAT_COLUMNS,
  type TeamCategoryTotals,
} from "@/components/CategoryHeatmap";
import { useWarmup, WarmupBanner } from "@/components/WarmupCountdown";

const looseKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
import {
  ArrowLeft,
  Clock,
  DollarSign,
  Flame,
  Download,
  Gavel,
  Loader2,
  Pause,
  Play,
  Search,
  Trophy,
  XCircle,
  Zap,
} from "lucide-react";

type Room = {
  player_pool?: string | null;
  id: string;
  name: string;
  host_user_id: string;
  team_count: number;
  rounds: number;
  draft_format: string;
  status: "waiting" | "drafting" | "paused" | "complete";
  paused_at?: string | null;
  warmup_until?: string | null;
  scoring_format: string;
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
};

type Participant = {
  id: string;
  user_id: string;
  draft_position: number | null;
  team_name: string;
};

type Pick = {
  id: string;
  pick_number: number;
  team_idx: number;
  user_id: string | null;
  player_id: string;
  player_name: string;
  player_position: string | null;
  player_team: string | null;
  auction_price: number | null;
  picked_at: string;
};

type Nomination = {
  id: string;
  room_id: string;
  nomination_number: number;
  nominator_team_idx: number;
  player_id: string;
  player_name: string;
  player_position: string | null;
  player_team: string | null;
  opening_bid: number;
  current_bid: number;
  current_bidder_team_idx: number;
  current_bidder_user_id: string | null;
  deadline: string;
  status: "active" | "awarded" | "cancelled";
};

type Bid = {
  id: string;
  nomination_id: string;
  team_idx: number;
  amount: number;
  bid_at: string;
};

interface Props {
  room: Room;
  userId: string | undefined;
  participants: Participant[];
  picks: Pick[];
}

const POSITIONS = ["ALL", "PG", "SG", "SF", "PF", "C"] as const;

export function AuctionRoom({ room, userId, participants, picks }: Props) {
  const navigate = useNavigate();
  const totalSlots =
    room.slots_pg +
    room.slots_sg +
    (room.slots_g ?? 0) +
    room.slots_sf +
    room.slots_pf +
    (room.slots_f ?? 0) +
    room.slots_c +
    room.slots_flx +
    room.slots_bn;

  const [players, setPlayers] = useState<DraftablePlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [valueByKey, setValueByKey] = useState<Record<string, number>>({});
  const [activeNoms, setActiveNoms] = useState<Nomination[]>([]);
  const [bidsByNom, setBidsByNom] = useState<Record<string, Bid[]>>({});
  const [now, setNow] = useState(Date.now());
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<(typeof POSITIONS)[number]>("ALL");
  const [bidAmountByNom, setBidAmountByNom] = useState<Record<string, string>>({});
  const [openingBid, setOpeningBid] = useState<string>("");
  const [nomViewMode, setNomViewMode] = useState<"condensed" | "expanded" | "all">("expanded");
  const [nomPage, setNomPage] = useState(0);
  const [statsPlayer, setStatsPlayer] = useState<DraftablePlayer | null>(null);
  const [latestStats, setLatestStats] = useState<Record<string, PlayerSeasonStats>>({});
  const [statsShade, setStatsShade] = useState<"plain" | "heatmap">("plain");
  const [mobileTab, setMobileTab] = useState<"players" | "myteam" | "teams">(
    "players"
  );
  const awardCallFiredRef = useRef<Set<string>>(new Set());

  const meParticipant = useMemo(
    () => participants.find((p) => p.user_id === userId) ?? null,
    [participants, userId]
  );
  const myTeamIdx = meParticipant?.draft_position ?? null;
  const isComplete = room.status === "complete";
  const isDrafting = room.status === "drafting";
  const isHost = !!userId && userId === room.host_user_id;
  const isPaused = room.status === "paused";

  // Pre-draft warm-up countdown (2 min after the room opens).
  const warmup = useWarmup(room.warmup_until);
  const inWarmup = isDrafting && warmup.active;

  // Auto-flash the summary page when the auction wraps up.
  const flashedSummaryRef = useRef(false);
  useEffect(() => {
    if (isComplete && !flashedSummaryRef.current) {
      flashedSummaryRef.current = true;
      const t = setTimeout(() => {
        navigate({ to: "/draft/$roomId/summary", params: { roomId: room.id } });
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [isComplete, navigate, room.id]);

  // ---- player pool ----
  const playersFetchedRef = useRef(false);
  useEffect(() => {
    if (room.status === "waiting" || playersFetchedRef.current) return;
    playersFetchedRef.current = true;
    setPlayersLoading(true);
    fetchActivePlayersServer({
      data: { pool: room.player_pool === "rookies" ? "rookies" : "all" },
    })
      .then(setPlayers)
      .catch((e) => console.error(e))
      .finally(() => setPlayersLoading(false));
  }, [room.status, room.player_pool]);

  // Suggested auction values (z-score). Recompute when league shape changes.
  useEffect(() => {
    if (room.status === "waiting") return;
    getAuctionValuesServer({
      data: {
        teamCount: room.team_count,
        rosterSize: totalSlots,
        budget: room.auction_budget,
        scoringFormat: room.scoring_format,
      },
    })
      .then(setValueByKey)
      .catch((e) => console.error("auction values failed", e));
  }, [
    room.status,
    room.team_count,
    totalSlots,
    room.auction_budget,
    room.scoring_format,
  ]);

  // ---- subscribe to auction tables ----
  useEffect(() => {
    let mounted = true;
    const loadActive = async () => {
      const { data } = await supabase
        .from("auction_nominations")
        .select("*")
        .eq("room_id", room.id)
        .eq("status", "active")
        .order("nomination_number", { ascending: true });
      if (!mounted) return;
      const noms = (data ?? []) as Nomination[];
      setActiveNoms(noms);
      for (const n of noms) loadBids(n.id);
    };
    const loadBids = async (nomId: string) => {
      const { data } = await supabase
        .from("auction_bids")
        .select("*")
        .eq("nomination_id", nomId)
        .order("bid_at", { ascending: false })
        .limit(20);
      if (mounted) setBidsByNom((prev) => ({ ...prev, [nomId]: (data ?? []) as Bid[] }));
    };
    loadActive();

    const channel = supabase
      .channel(`auction-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "auction_nominations",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          const row = payload.new as Nomination | undefined;
          if (!row) return;
          if (row.status === "active") {
            setActiveNoms((prev) => {
              const others = prev.filter((n) => n.id !== row.id);
              return [...others, row].sort(
                (a, b) => a.nomination_number - b.nomination_number,
              );
            });
            if (!bidsByNom[row.id]) loadBids(row.id);
          } else {
            setActiveNoms((prev) => prev.filter((n) => n.id !== row.id));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "auction_bids",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          const bid = payload.new as Bid;
          setBidsByNom((prev) => ({
            ...prev,
            [bid.nomination_id]: [bid, ...(prev[bid.nomination_id] ?? [])].slice(0, 20),
          }));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  // ---- countdown tick ----
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const secondsLeftByNom = useMemo(() => {
    const m: Record<string, number> = {};
    for (const n of activeNoms) {
      m[n.id] = Math.max(0, Math.ceil((new Date(n.deadline).getTime() - now) / 1000));
    }
    return m;
  }, [activeNoms, now]);

  // ---- when any nomination's timer hits 0, fire award_due (any client) ----
  useEffect(() => {
    if (isPaused) return;
    const expired = activeNoms.filter((n) => (secondsLeftByNom[n.id] ?? 1) <= 0);
    const fresh = expired.filter((n) => !awardCallFiredRef.current.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => awardCallFiredRef.current.add(n.id));
    supabase.rpc("auction_award_due", { _room_id: room.id }).then(({ error }) => {
      if (error) console.error("award_due failed", error);
    });
  }, [secondsLeftByNom, activeNoms, room.id, isPaused]);

  // ---- drive bot nominations + bids every few seconds so bots act in real time ----
  useEffect(() => {
    if (isPaused) return;
    if (room.status !== "drafting") return;
    let cancelled = false;
    const runBots = async () => {
      if (cancelled) return;
      await supabase.rpc("auction_bot_nominate_due");
      if (cancelled) return;
      await supabase.rpc("auction_bot_bid_due");
    };
    runBots();
    const interval = setInterval(runBots, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [room.id, room.status, isPaused]);

  // ---- per-team budgets / rosters ----
  const teamSpent = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of picks) {
      m.set(p.team_idx, (m.get(p.team_idx) ?? 0) + (p.auction_price ?? 0));
    }
    return m;
  }, [picks]);
  const teamPickCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of picks) m.set(p.team_idx, (m.get(p.team_idx) ?? 0) + 1);
    return m;
  }, [picks]);

  // Per-team active nomination & total nomination counts (for snake skip logic)
  const teamActiveNomCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const n of activeNoms) {
      m.set(n.nominator_team_idx, (m.get(n.nominator_team_idx) ?? 0) + 1);
    }
    return m;
  }, [activeNoms]);
  // Total noms (active + awarded). Awarded ones become picks, active ones live in activeNoms.
  const teamTotalNomCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of picks) m.set(p.team_idx, (m.get(p.team_idx) ?? 0) + 1);
    for (const n of activeNoms) {
      m.set(n.nominator_team_idx, (m.get(n.nominator_team_idx) ?? 0) + 1);
    }
    return m;
  }, [picks, activeNoms]);

  const myPicks = useMemo(
    () => (myTeamIdx ? picks.filter((p) => p.team_idx === myTeamIdx) : []),
    [picks, myTeamIdx]
  );
  const mySpent = myTeamIdx ? teamSpent.get(myTeamIdx) ?? 0 : 0;
  const myPickCount = myTeamIdx ? teamPickCount.get(myTeamIdx) ?? 0 : 0;
  const myRemainingSlots = totalSlots - myPickCount;
  const myMaxAffordable = Math.max(
    0,
    room.auction_budget - mySpent - Math.max(0, myRemainingSlots - 1)
  );

  // ---- nomination eligibility ----
  // Any team can nominate concurrently as long as they're under their per-team
  // cap, total quota, and the room-wide concurrent cap. No strict snake turn —
  // the pool fills up quickly at draft start when concurrency is > 1.
  const nomQuota = room.auction_nominations_per_team;
  const perTeamConcurrent = Math.max(1, room.auction_concurrent_per_team ?? 1);
  const concurrencyCap = room.auction_max_concurrent_nominations ?? 1;
  const canNominateMore = activeNoms.length < concurrencyCap;
  const myActiveNomCount = myTeamIdx ? teamActiveNomCount.get(myTeamIdx) ?? 0 : 0;
  const myTotalNomCount = myTeamIdx ? teamTotalNomCount.get(myTeamIdx) ?? 0 : 0;
  const myPickedCount = myTeamIdx ? teamPickCount.get(myTeamIdx) ?? 0 : 0;
  const myQuotaRemaining =
    nomQuota == null ? Infinity : Math.max(0, nomQuota - myTotalNomCount);
  const isMyNomination =
    !!myTeamIdx &&
    isDrafting &&
    canNominateMore &&
    myActiveNomCount < perTeamConcurrent &&
    myQuotaRemaining > 0 &&
    myPickedCount < totalSlots;

  // ---- player filtering ----
  const draftedIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);
  const onBlockIds = useMemo(() => new Set(activeNoms.map((n) => n.player_id)), [activeNoms]);
  const playerById = useMemo(() => {
    const m = new Map<string, DraftablePlayer>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);
  const openStatsFor = useCallback(
    (id: string, name: string, position: string | null, team: string | null) => {
      const found = playerById.get(id);
      setStatsPlayer(
        found ?? {
          id,
          name,
          position: position ?? "—",
          team: team ?? "—",
          teamFull: team ?? "Unknown team",
          nbaPlayerId: null,
        },
      );
    },
    [playerById],
  );
  const filteredPlayers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return players
      .filter((p) => !draftedIds.has(p.id))
      .filter((p) => !onBlockIds.has(p.id))
      .filter((p) => posFilter === "ALL" || (p.position || "").includes(posFilter))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort(compareByRank)
      .slice(0, 200);
  }, [players, draftedIds, onBlockIds, posFilter, search]);

  // ---- season stats for heatmaps ----
  useEffect(() => {
    if (players.length === 0) return;
    let cancelled = false;
    fetchLatestStatsForPlayersServer({ data: { playerKeys: players.map((p) => p.id) } })
      .then((map) => {
        if (!cancelled) setLatestStats(map);
      })
      .catch((e) => console.error("latest stats fetch failed", e));
    return () => {
      cancelled = true;
    };
  }, [players]);

  // Per-stat max across visible players (shades the player-pool heatmap).
  const statMax = useMemo(() => {
    const max: Record<string, number> = {};
    for (const col of STAT_COLUMNS) max[col.key] = 0;
    for (const p of filteredPlayers) {
      const s = latestStats[p.id];
      if (!s) continue;
      for (const col of STAT_COLUMNS) {
        const v = s[col.key] as number | null | undefined;
        if (v != null && v > max[col.key]) max[col.key] = v;
      }
    }
    return max;
  }, [filteredPlayers, latestStats]);

  // Per-team category totals (My Team heatmap ranks against the league).
  const teamTotalsByIdx = useMemo(() => {
    const byTeam = new Map<number, Pick[]>();
    for (const pk of picks) {
      const arr = byTeam.get(pk.team_idx) ?? [];
      arr.push(pk);
      byTeam.set(pk.team_idx, arr);
    }
    const out = new Map<number, TeamCategoryTotals>();
    for (const [idx, ps] of byTeam) out.set(idx, computeTeamTotals(ps, latestStats));
    return out;
  }, [picks, latestStats]);

  const myTotals = myTeamIdx ? (teamTotalsByIdx.get(myTeamIdx) ?? null) : null;

  // ---- handlers ----
  const handleNominate = useCallback(
    async (player: DraftablePlayer) => {
      if (!isMyNomination) return;
      const opening = Math.max(room.auction_min_bid, parseInt(openingBid || "0", 10) || room.auction_min_bid);
      setActionBusy(true);
      setError(null);
      const { error } = await supabase.rpc("auction_nominate", {
        _room_id: room.id,
        _player_id: player.id,
        _player_name: player.name,
        _player_position: player.position,
        _player_team: player.team,
        _opening_bid: opening,
      });
      setActionBusy(false);
      if (error) setError(error.message);
      else setOpeningBid("");
    },
    [isMyNomination, room.id, room.auction_min_bid, openingBid]
  );

  const handleBid = useCallback(
    async (nomId: string, amount: number) => {
      setActionBusy(true);
      setError(null);
      const { error } = await supabase.rpc("auction_bid", {
        _nomination_id: nomId,
        _amount: amount,
      });
      setActionBusy(false);
      if (error) setError(error.message);
      else setBidAmountByNom((prev) => ({ ...prev, [nomId]: "" }));
    },
    []
  );

  const handlePauseToggle = async () => {
    setActionBusy(true);
    setError(null);
    const rpcName = isPaused ? "resume_draft" : "pause_draft";
    const { error } = await supabase.rpc(rpcName, { _room_id: room.id });
    setActionBusy(false);
    if (error) setError(error.message);
  };

  const handleEndDraft = async () => {
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

  const handleExport = () => {
    const teamNameByIdx = new Map<number, string>();
    for (const p of participants) {
      if (p.draft_position) teamNameByIdx.set(p.draft_position, p.team_name);
    }
    const rows: ExportPickRow[] = picks.map((pk) => ({
      pick_number: pk.pick_number,
      round: 0,
      team_idx: pk.team_idx,
      team_name: teamNameByIdx.get(pk.team_idx) ?? `Team ${pk.team_idx}`,
      player_name: pk.player_name,
      player_position: pk.player_position,
      player_team: pk.player_team,
      was_autopick: false,
      auction_price: pk.auction_price,
    }));
    downloadDraftXlsx(
      {
        roomName: room.name,
        draftFormat: room.draft_format,
        scoringFormat: room.scoring_format,
        teamCount: room.team_count,
        budget: room.auction_budget,
      },
      rows,
    );
  };

  // ---- render ----
  const formatLabel =
    room.draft_format === "auction_slow" ? "Slow Auction" : "Auction";

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
                {isComplete ? "Auction complete" : `${formatLabel} · ${picks.length} picks`}
              </div>
              <div className="text-lg font-black">{room.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {myTeamIdx && (
              <div className="rounded-md border-2 border-border bg-card px-3 py-1.5">
                <div className="text-xs font-bold uppercase text-muted-foreground">
                  Your budget
                </div>
                <div className="text-lg font-black text-primary tabular-nums">
                  ${room.auction_budget - mySpent}
                  <span className="ml-1 text-xs font-bold text-muted-foreground">
                    / ${room.auction_budget}
                  </span>
                </div>
              </div>
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
                isAuction={true}
                canForceSkip={isDrafting && activeNoms.length > 0}
                recentPicks={[...picks]
                  .sort((a, b) => b.pick_number - a.pick_number)
                  .map((p) => ({
                    id: p.id,
                    pick_number: p.pick_number,
                    team_idx: p.team_idx,
                    player_name: p.player_name,
                    team_name:
                      participants.find((x) => x.draft_position === p.team_idx)
                        ?.team_name ?? `Team ${p.team_idx}`,
                  }))}
                availablePlayers={players.filter((p) => !draftedIds.has(p.id))}
                pickClockSec={60}
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

      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        {error && (
          <div className="mb-4 rounded-md border-2 border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive">
            {error}
          </div>
        )}

        {/* Active nominations */}
        {isDrafting && (
          <div className="mb-6 space-y-4">
            {activeNoms.length === 0 && (
              <Card className="border-2 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Auction pool
                    </div>
                    <div className="text-xl font-black">No active nominations</div>
                  </div>
                  {isMyNomination ? (
                    <div className="flex items-center gap-2">
                      <Gavel className="h-5 w-5 text-primary" />
                      <Input
                        type="number"
                        placeholder={`opening $${room.auction_min_bid}`}
                        value={openingBid}
                        onChange={(e) => setOpeningBid(e.target.value)}
                        className="h-9 w-32"
                        min={room.auction_min_bid}
                        max={myMaxAffordable}
                      />
                      <span className="text-sm font-semibold text-muted-foreground">
                        Pick a player below to nominate
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Waiting for nomination…
                    </div>
                  )}
                </div>
              </Card>
            )}

            {activeNoms.length > 0 && (() => {
              const pageSize =
                nomViewMode === "condensed" ? 3 : nomViewMode === "expanded" ? 6 : activeNoms.length;
              const pageCount = Math.max(1, Math.ceil(activeNoms.length / pageSize));
              const safePage = Math.min(nomPage, pageCount - 1);
              const start = safePage * pageSize;
              const visibleNoms =
                nomViewMode === "all" ? activeNoms : activeNoms.slice(start, start + pageSize);
              const scrollCls =
                nomViewMode === "condensed"
                  ? "max-h-[280px] overflow-y-auto pr-1"
                  : nomViewMode === "expanded"
                    ? "max-h-[600px] overflow-y-auto pr-1"
                    : "";
              const gridCls =
                nomViewMode === "condensed"
                  ? ""
                  : visibleNoms.length > 1
                    ? "md:grid-cols-2 xl:grid-cols-3"
                    : "";
              const cardPad = nomViewMode === "condensed" ? "p-2" : "p-3";
              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      On the block
                      <span className="ml-2 text-foreground">
                        {nomViewMode === "all"
                          ? activeNoms.length
                          : `${start + 1}-${Math.min(start + pageSize, activeNoms.length)} / ${activeNoms.length}`}
                      </span>
                    </div>

                    <ToggleGroup
                      type="single"
                      size="sm"
                      value={nomViewMode}
                      onValueChange={(v) => {
                        if (v) setNomViewMode(v as typeof nomViewMode);
                      }}
                      className="border rounded-md"
                    >
                      <ToggleGroupItem value="condensed" className="h-7 px-2 text-xs font-bold">
                        Condensed
                      </ToggleGroupItem>
                      <ToggleGroupItem value="expanded" className="h-7 px-2 text-xs font-bold">
                        Expanded
                      </ToggleGroupItem>
                      <ToggleGroupItem value="all" className="h-7 px-2 text-xs font-bold">
                        All
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  {nomViewMode !== "all" && pageCount > 1 && (
                    <div className="flex flex-wrap items-center gap-1">
                      {Array.from({ length: pageCount }).map((_, i) => (
                        <Button
                          key={i}
                          size="sm"
                          variant={i === safePage ? "default" : "outline"}
                          onClick={() => setNomPage(i)}
                          className="h-7 px-2 text-xs font-bold"
                        >
                          {i * pageSize + 1}-{Math.min((i + 1) * pageSize, activeNoms.length)}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className={scrollCls}>
                    <div className={`grid gap-3 ${gridCls}`}>
                      {visibleNoms.map((nom) => {
                        const secondsLeft = secondsLeftByNom[nom.id] ?? 0;
                        const isMyTop = myTeamIdx === nom.current_bidder_team_idx;
                        const minNextBid = nom.current_bid + 1;
                        const bidAmount = bidAmountByNom[nom.id] ?? "";
                        const sug = valueByKey[looseKey(nom.player_id)];
                        const delta = sug != null ? sug - nom.current_bid : null;
                        return (
                          <Card key={nom.id} className={`border-2 ${cardPad}`}>
                            <div className="flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openStatsFor(
                                      nom.player_id,
                                      nom.player_name,
                                      nom.player_position,
                                      nom.player_team,
                                    )
                                  }
                                  className="block w-full truncate text-left text-sm font-black leading-tight underline-offset-2 hover:underline"
                                  title="View season stats"
                                >
                                  {nom.player_name}
                                </button>
                                <div className="truncate text-[11px] text-muted-foreground">
                                  {nom.player_position} · {nom.player_team}
                                  {sug != null && (
                                    <span className="ml-1.5 font-bold">· Sug ${sug}</span>
                                  )}
                                  {delta != null && delta !== 0 && (
                                    <span
                                      className={`ml-1 font-bold ${
                                        delta > 0
                                          ? "text-emerald-600 dark:text-emerald-400"
                                          : "text-destructive"
                                      }`}
                                    >
                                      ({delta > 0 ? `+$${delta}` : `-$${Math.abs(delta)}`})
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col items-end shrink-0">
                                <span
                                  className={`text-base font-black tabular-nums leading-none ${
                                    secondsLeft <= 10 ? "text-destructive" : "text-primary"
                                  }`}
                                >
                                  {secondsLeft >= 3600
                                    ? `${Math.floor(secondsLeft / 3600)}:${String(
                                        Math.floor((secondsLeft % 3600) / 60),
                                      ).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`
                                    : `${Math.floor(secondsLeft / 60)}:${String(
                                        secondsLeft % 60,
                                      ).padStart(2, "0")}`}
                                </span>
                                <span className="mt-0.5 text-lg font-black tabular-nums text-primary leading-none">
                                  ${nom.current_bid}
                                </span>
                                <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                  {participants.find(
                                    (p) => p.draft_position === nom.current_bidder_team_idx,
                                  )?.team_name ?? `Team ${nom.current_bidder_team_idx}`}
                                </span>
                              </div>
                            </div>

                            {myTeamIdx && !isMyTop && myPickCount < totalSlots && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {[1, 2, 5, 10].map((d) => {
                                  const amt = nom.current_bid + d;
                                  const disabled = amt > myMaxAffordable || actionBusy;
                                  return (
                                    <Button
                                      key={d}
                                      onClick={() => handleBid(nom.id, amt)}
                                      disabled={disabled}
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2 font-bold text-xs"
                                    >
                                      +${d}
                                    </Button>
                                  );
                                })}
                                <Input
                                  type="number"
                                  placeholder={`$${minNextBid}`}
                                  value={bidAmount}
                                  onChange={(e) =>
                                    setBidAmountByNom((prev) => ({ ...prev, [nom.id]: e.target.value }))
                                  }
                                  className="h-7 w-20 text-xs"
                                  min={minNextBid}
                                  max={myMaxAffordable}
                                />
                                <Button
                                  onClick={() => {
                                    const a = parseInt(bidAmount, 10);
                                    if (!isNaN(a)) handleBid(nom.id, a);
                                  }}
                                  disabled={actionBusy || !bidAmount}
                                  size="sm"
                                  className="h-7 px-2 font-bold text-xs"
                                >
                                  Bid
                                </Button>
                              </div>
                            )}
                            {isMyTop && (
                              <Badge className="mt-2 font-bold">
                                <Zap className="mr-1 inline h-3 w-3" />
                                You hold the high bid
                              </Badge>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* "Nominate next" hint when concurrency allows it */}
            {activeNoms.length > 0 && isMyNomination && (
              <Card className="border-2 border-dashed border-primary/40 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Gavel className="h-5 w-5 text-primary" />
                  <span className="text-sm font-bold">
                    You can nominate another player ({activeNoms.length}/{concurrencyCap} on the block)
                    {nomQuota != null && ` · ${myQuotaRemaining} of ${nomQuota} nominations left`}
                  </span>
                  <Input
                    type="number"
                    placeholder={`opening $${room.auction_min_bid}`}
                    value={openingBid}
                    onChange={(e) => setOpeningBid(e.target.value)}
                    className="h-9 w-32"
                    min={room.auction_min_bid}
                    max={myMaxAffordable}
                  />
                  <span className="text-xs text-muted-foreground">
                    Pick a player below to nominate
                  </span>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Mobile tabs */}
        <div className="mb-4 lg:hidden">
          <Tabs
            value={mobileTab}
            onValueChange={(v) => setMobileTab(v as typeof mobileTab)}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="players" className="font-bold">
                Players
              </TabsTrigger>
              <TabsTrigger value="myteam" className="font-bold">
                My team
              </TabsTrigger>
              <TabsTrigger value="teams" className="font-bold">
                Teams
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:h-[calc(100vh-220px)] lg:min-h-[600px]">
          {/* Player pool */}
          <div className={mobileTab === "players" ? "lg:flex lg:flex-col lg:h-full" : "hidden lg:flex lg:flex-col lg:h-full"}>
            <Card className="border-2 flex flex-col lg:flex-1 lg:min-h-0">

              <div className="flex flex-wrap items-center gap-2 border-b-2 border-border p-4">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search players…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {POSITIONS.map((p) => (
                    <Button
                      key={p}
                      onClick={() => setPosFilter(p)}
                      size="sm"
                      variant={posFilter === p ? "default" : "outline"}
                      className="font-bold"
                    >
                      {p}
                    </Button>
                  ))}
                </div>
                <Button
                  onClick={() =>
                    setStatsShade((m) => (m === "heatmap" ? "plain" : "heatmap"))
                  }
                  size="sm"
                  variant={statsShade === "heatmap" ? "default" : "outline"}
                  className="font-bold"
                  title="Toggle per-player stat heatmap"
                >
                  <Flame className="h-3 w-3" /> Stats
                </Button>
              </div>

              {playersLoading ? (
                <div className="flex justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ul className="max-h-[380px] lg:max-h-[520px] overflow-y-auto divide-y divide-border">
                  {filteredPlayers.map((pl) => {
                    const sug = valueByKey[looseKey(pl.id)];
                    return (
                    <li
                      key={pl.id}
                      className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-3 py-1.5 hover:bg-muted/50"
                    >
                      <button
                        type="button"
                        onClick={() => setStatsPlayer(pl)}
                        className="flex items-center gap-2 min-w-0 text-left transition hover:opacity-80"
                        title="View season stats"
                      >
                        <PlayerAvatar
                          name={pl.name}
                          team={pl.team}
                          nbaPlayerId={pl.nbaPlayerId}
                          size={28}
                          shape="square"
                        />
                        <div className="min-w-0 leading-tight">
                          <div className="truncate text-sm font-bold underline-offset-2 hover:underline">
                            {pl.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {pl.position} · {pl.team}
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <div
                          className="text-right tabular-nums"
                          title="Suggested auction value (z-score, last season)"
                        >
                          <div className="text-sm font-black text-primary leading-none">
                            {sug != null ? `$${sug}` : "—"}
                          </div>
                        </div>
                        {isMyNomination ? (
                          <Button
                            onClick={() => handleNominate(pl)}
                            size="sm"
                            disabled={actionBusy}
                            className="h-7 px-2 font-bold text-xs"
                          >
                            <Gavel className="h-3 w-3" /> Nominate
                          </Button>
                        ) : null}
                      </div>
                      {statsShade === "heatmap" && (
                        <div className="order-last flex w-full shrink-0 items-stretch overflow-x-auto rounded-md border border-border/70 bg-background/70 text-[11px] font-bold tabular-nums">
                          {STAT_COLUMNS.map((col, ci) => (
                            <StatCell
                              key={col.key}
                              label={col.label}
                              value={latestStats[pl.id]?.[col.key] as number | null | undefined}
                              max={statMax[col.key]}
                              mode="heatmap"
                              decimals={col.decimals}
                              divider={ci !== 0}
                            />
                          ))}
                        </div>
                      )}
                    </li>

                    );
                  })}
                  {filteredPlayers.length === 0 && (
                    <li className="p-6 text-center text-sm text-muted-foreground">
                      No players match
                    </li>
                  )}
                </ul>
              )}
            </Card>

            {/* Bid history (combined across active nominations) */}
            {activeNoms.length > 0 && (
              <Card className="mt-4 border-2 p-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Recent bids
                </div>
                <ul className="space-y-1 text-sm">
                  {activeNoms.flatMap((n) =>
                    (bidsByNom[n.id] ?? []).slice(0, 3).map((b) => ({ ...b, nom: n }))
                  )
                    .sort((a, b) => new Date(b.bid_at).getTime() - new Date(a.bid_at).getTime())
                    .slice(0, 10)
                    .map((b) => {
                      const bp = participants.find((p) => p.draft_position === b.team_idx);
                      return (
                        <li key={b.id} className="flex justify-between gap-2 font-mono">
                          <span className="truncate font-bold">
                            {bp?.team_name ?? `Team ${b.team_idx}`}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {b.nom.player_name}
                          </span>
                          <span className="text-primary font-black">${b.amount}</span>
                        </li>
                      );
                    })}
                </ul>
              </Card>
            )}
          </div>

          {/* Right rail: my team + budgets */}
          <div className={mobileTab !== "players" ? "lg:h-full lg:overflow-y-auto lg:pr-1" : "hidden lg:block lg:h-full lg:overflow-y-auto lg:pr-1"}>
            {myTeamIdx && (
              <Card className="border-2 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    My roster
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">
                    {myPickCount}/{totalSlots}
                  </span>
                </div>
                {myTotals && myPicks.length > 0 && (
                  <div className="-mx-4 mb-3">
                    <CategoryHeatmap
                      totals={myTotals}
                      allTotals={Array.from(teamTotalsByIdx.values())}
                    />
                  </div>
                )}
                {myPicks.length === 0 ? (
                  <div className="text-sm italic text-muted-foreground">
                    No picks yet
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {myPicks.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-bold">{p.player_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.player_position} · {p.player_team}
                          </div>
                        </div>
                        <span className="font-black tabular-nums text-primary">
                          ${p.auction_price ?? 0}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            <Card className={`border-2 p-4 ${myTeamIdx ? "mt-4" : ""} ${mobileTab === "myteam" ? "hidden lg:block" : ""}`}>
              <div className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Team budgets
              </div>
              <ul className="space-y-2">
                {Array.from({ length: room.team_count }).map((_, i) => {
                  const idx = i + 1;
                  const part = participants.find((p) => p.draft_position === idx);
                  const spent = teamSpent.get(idx) ?? 0;
                  const remaining = room.auction_budget - spent;
                  const cnt = teamPickCount.get(idx) ?? 0;
                  const remainingSlots = totalSlots - cnt;
                  const maxBid = Math.max(0, remaining - Math.max(0, remainingSlots - 1));
                  const isNom = (teamActiveNomCount.get(idx) ?? 0) > 0;
                  const isHigh = activeNoms.some(
                    (n) => n.current_bidder_team_idx === idx,
                  );
                  const isMine = idx === myTeamIdx;
                  return (
                    <li
                      key={idx}
                      className={`rounded-md border-2 p-2 ${
                        isMine
                          ? "border-primary bg-primary/5"
                          : isNom || isHigh
                            ? "border-accent bg-accent/10"
                            : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate font-bold">
                          {part?.team_name ?? `Team ${idx}`}
                        </span>
                        <span className="text-sm font-black tabular-nums text-primary">
                          ${remaining}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {cnt}/{totalSlots} slots
                        </span>
                        <span>max ${maxBid}</span>
                      </div>
                      <div className="mt-1 flex gap-1">
                        {isNom && (teamActiveNomCount.get(idx) ?? 0) === 0 && canNominateMore && (
                          <Badge variant="outline" className="text-[10px] font-bold">
                            <Gavel className="h-3 w-3" /> Nominating
                          </Badge>
                        )}
                        {isHigh && (
                          <Badge className="text-[10px] font-bold">
                            <Zap className="h-3 w-3" /> High bid
                          </Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </div>

        {isComplete && (
          <Card className="mt-8 border-2 p-6 text-center">
            <Trophy className="mx-auto h-10 w-10 text-primary" />
            <div className="mt-2 text-2xl font-black">Auction complete!</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Heading to your draft summary…
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button asChild size="lg" className="font-bold">
                <Link to="/draft/$roomId/summary" params={{ roomId: room.id }}>
                  <Trophy /> View summary
                </Link>
              </Button>
              <Button onClick={handleExport} variant="outline" className="font-bold">
                <Download /> Export XLSX
              </Button>
            </div>
          </Card>
        )}
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
      />
    </div>
  );
}
