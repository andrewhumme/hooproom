import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { AppHeader } from "@/components/AppHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { supabase } from "@/integrations/supabase/client";
import { fetchActivePlayersServer } from "@/lib/players.functions";
import { getAuctionValuesServer } from "@/lib/auctionValues.functions";
import type { DraftablePlayer } from "@/lib/balldontlie";
import { compareByRank } from "@/lib/playerRankings";
import { buildDraftCsv, downloadCsv } from "@/lib/draftExport";

const looseKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
import {
  ArrowLeft,
  Clock,
  DollarSign,
  Download,
  Gavel,
  Loader2,
  Search,
  Trophy,
  XCircle,
  Zap,
} from "lucide-react";

type Room = {
  id: string;
  name: string;
  host_user_id: string;
  team_count: number;
  rounds: number;
  draft_format: string;
  status: "waiting" | "drafting" | "complete";
  scoring_format: string;
  auction_budget: number;
  auction_min_bid: number;
  auction_bid_clock_sec: number;
  auction_antisnipe_threshold_sec: number | null;
  slots_pg: number;
  slots_sg: number;
  slots_sf: number;
  slots_pf: number;
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
    room.slots_sf +
    room.slots_pf +
    room.slots_c +
    room.slots_flx +
    room.slots_bn;

  const [players, setPlayers] = useState<DraftablePlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [valueByKey, setValueByKey] = useState<Record<string, number>>({});
  const [activeNom, setActiveNom] = useState<Nomination | null>(null);
  const [bidHistory, setBidHistory] = useState<Bid[]>([]);
  const [now, setNow] = useState(Date.now());
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<(typeof POSITIONS)[number]>("ALL");
  const [bidAmount, setBidAmount] = useState<string>("");
  const [openingBid, setOpeningBid] = useState<string>("");
  const [mobileTab, setMobileTab] = useState<"players" | "myteam" | "teams">(
    "players"
  );
  const awardCallFiredRef = useRef<string>("");

  const meParticipant = useMemo(
    () => participants.find((p) => p.user_id === userId) ?? null,
    [participants, userId]
  );
  const myTeamIdx = meParticipant?.draft_position ?? null;
  const isComplete = room.status === "complete";
  const isDrafting = room.status === "drafting";
  const isHost = !!userId && userId === room.host_user_id;

  // ---- player pool ----
  const playersFetchedRef = useRef(false);
  useEffect(() => {
    if (room.status === "waiting" || playersFetchedRef.current) return;
    playersFetchedRef.current = true;
    setPlayersLoading(true);
    fetchActivePlayersServer()
      .then(setPlayers)
      .catch((e) => console.error(e))
      .finally(() => setPlayersLoading(false));
  }, [room.status]);

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
        .order("nomination_number", { ascending: false })
        .limit(1);
      if (!mounted) return;
      const nom = (data?.[0] ?? null) as Nomination | null;
      setActiveNom(nom);
      if (nom) loadBids(nom.id);
    };
    const loadBids = async (nomId: string) => {
      const { data } = await supabase
        .from("auction_bids")
        .select("*")
        .eq("nomination_id", nomId)
        .order("bid_at", { ascending: false })
        .limit(20);
      if (mounted) setBidHistory((data ?? []) as Bid[]);
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
            setActiveNom(row);
            loadBids(row.id);
          } else {
            // awarded / cancelled — clear if it was current
            setActiveNom((prev) => (prev && prev.id === row.id ? null : prev));
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
          setBidHistory((prev) => [bid, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [room.id]);

  // ---- countdown tick ----
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const secondsLeft = useMemo(() => {
    if (!activeNom) return 0;
    return Math.max(0, Math.ceil((new Date(activeNom.deadline).getTime() - now) / 1000));
  }, [activeNom, now]);

  // ---- when timer hits 0, fire award_due (any client) ----
  useEffect(() => {
    if (!activeNom || activeNom.status !== "active") return;
    if (secondsLeft > 0) return;
    if (awardCallFiredRef.current === activeNom.id) return;
    awardCallFiredRef.current = activeNom.id;
    supabase.rpc("auction_award_due", { _room_id: room.id }).then(({ error }) => {
      if (error) console.error("award_due failed", error);
    });
  }, [secondsLeft, activeNom, room.id]);

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

  // ---- nomination turn ----
  const completedNoms = picks.length; // 1 award per pick
  const direction = Math.floor(completedNoms / room.team_count) % 2; // 0 fwd, 1 rev
  const slotInRound = completedNoms % room.team_count;
  // walk teams, skipping full rosters
  const nominatorTeamIdx = useMemo(() => {
    let cursor = completedNoms;
    for (let i = 0; i < room.team_count * totalSlots; i++) {
      const dir = Math.floor(cursor / room.team_count) % 2;
      const slot = cursor % room.team_count;
      const candidate = dir === 0 ? slot + 1 : room.team_count - slot;
      const cnt = teamPickCount.get(candidate) ?? 0;
      if (cnt < totalSlots) return candidate;
      cursor++;
    }
    return null;
  }, [completedNoms, room.team_count, totalSlots, teamPickCount]);
  void direction;
  void slotInRound;

  const isMyNomination = activeNom === null && nominatorTeamIdx === myTeamIdx;
  const nominatorParticipant = participants.find(
    (p) => p.draft_position === nominatorTeamIdx
  );

  // ---- player filtering ----
  const draftedIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);
  const filteredPlayers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return players
      .filter((p) => !draftedIds.has(p.id))
      .filter((p) => activeNom?.player_id !== p.id)
      .filter((p) => posFilter === "ALL" || (p.position || "").includes(posFilter))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort(compareByRank)
      .slice(0, 200);
  }, [players, draftedIds, activeNom, posFilter, search]);

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
    async (amount: number) => {
      if (!activeNom) return;
      setActionBusy(true);
      setError(null);
      const { error } = await supabase.rpc("auction_bid", {
        _nomination_id: activeNom.id,
        _amount: amount,
      });
      setActionBusy(false);
      if (error) setError(error.message);
      else setBidAmount("");
    },
    [activeNom]
  );

  const handleExport = () => {
    const teamNameByIdx = new Map<number, string>();
    for (const p of participants) {
      if (p.draft_position) teamNameByIdx.set(p.draft_position, p.team_name);
    }
    const rows = picks.map((pk) => ({
      pick_number: pk.pick_number,
      round: 0,
      team_idx: pk.team_idx,
      team_name: teamNameByIdx.get(pk.team_idx) ?? `Team ${pk.team_idx}`,
      player_name: pk.player_name,
      player_position: pk.player_position,
      player_team: pk.player_team,
      was_autopick: false,
    }));
    const csv = buildDraftCsv(room.name, rows);
    const safe = room.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    downloadCsv(`${safe}_auction.csv`, csv);
  };

  // ---- render ----
  const isMyTopBid =
    activeNom && myTeamIdx === activeNom.current_bidder_team_idx;
  const minNextBid = activeNom ? activeNom.current_bid + 1 : 0;
  const formatLabel =
    room.draft_format === "auction_slow" ? "Slow Auction" : "Auction";

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
            {isComplete && (
              <Button onClick={handleExport} className="font-bold">
                <Download /> Export CSV
              </Button>
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

        {/* Active nomination card */}
        {isDrafting && (
          <Card className="mb-6 border-2 p-5">
            {activeNom ? (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <PlayerAvatar
                    name={activeNom.player_name}
                    team={activeNom.player_team ?? ""}
                    size={80}
                  />
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      On the block
                    </div>
                    <div className="text-2xl font-black">{activeNom.player_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {activeNom.player_position} · {activeNom.player_team}
                    </div>
                    {(() => {
                      const sug = valueByKey[looseKey(activeNom.player_id)];
                      if (sug == null) return null;
                      const delta = sug - activeNom.current_bid;
                      const isValue = delta > 0;
                      return (
                        <div className="mt-1.5 flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="font-bold text-xs"
                            title="Suggested value (z-score, last season)"
                          >
                            Sug ${sug}
                          </Badge>
                          <span
                            className={`text-xs font-bold ${
                              isValue
                                ? "text-emerald-600 dark:text-emerald-400"
                                : delta < 0
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {delta > 0 ? `+$${delta} value` : delta < 0 ? `$${Math.abs(delta)} over` : "at value"}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex flex-col items-start gap-1 lg:items-end">
                  <div className="flex items-center gap-2">
                    <Clock
                      className={`h-5 w-5 ${secondsLeft <= 10 ? "text-destructive" : "text-primary"}`}
                    />
                    <span
                      className={`text-3xl font-black tabular-nums ${secondsLeft <= 10 ? "text-destructive" : "text-primary"}`}
                    >
                      {Math.floor(secondsLeft / 60)}:
                      {String(secondsLeft % 60).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <span className="text-2xl font-black tabular-nums text-primary">
                      ${activeNom.current_bid}
                    </span>
                    <span className="text-muted-foreground">
                      ·{" "}
                      {participants.find(
                        (p) => p.draft_position === activeNom.current_bidder_team_idx
                      )?.team_name ?? `Team ${activeNom.current_bidder_team_idx}`}
                    </span>
                  </div>
                </div>

                {/* bid controls */}
                {myTeamIdx && !isMyTopBid && myPickCount < totalSlots && (
                  <div className="flex flex-wrap items-center gap-2">
                    {[1, 2, 5, 10].map((delta) => {
                      const amt = activeNom.current_bid + delta;
                      const disabled = amt > myMaxAffordable || actionBusy;
                      return (
                        <Button
                          key={delta}
                          onClick={() => handleBid(amt)}
                          disabled={disabled}
                          variant="outline"
                          className="font-bold"
                        >
                          +${delta}
                        </Button>
                      );
                    })}
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        placeholder={`min $${minNextBid}`}
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        className="h-9 w-24"
                        min={minNextBid}
                        max={myMaxAffordable}
                      />
                      <Button
                        onClick={() => {
                          const a = parseInt(bidAmount, 10);
                          if (!isNaN(a)) handleBid(a);
                        }}
                        disabled={actionBusy || !bidAmount}
                        className="font-bold"
                      >
                        Bid
                      </Button>
                    </div>
                    <div className="text-xs font-semibold text-muted-foreground">
                      max ${myMaxAffordable}
                    </div>
                  </div>
                )}
                {isMyTopBid && (
                  <Badge className="font-bold">
                    <Zap className="mr-1 inline h-3 w-3" />
                    You hold the high bid
                  </Badge>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Up to nominate
                  </div>
                  <div className="text-xl font-black">
                    {nominatorParticipant?.team_name ?? `Team ${nominatorTeamIdx}`}
                  </div>
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
            )}
          </Card>
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

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Player pool */}
          <div className={mobileTab === "players" ? "" : "hidden lg:block"}>
            <Card className="border-2">
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
              </div>

              {playersLoading ? (
                <div className="flex justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ul className="max-h-[60vh] overflow-y-auto divide-y divide-border">
                  {filteredPlayers.map((pl) => {
                    const sug = valueByKey[looseKey(pl.id)];
                    return (
                    <li
                      key={pl.id}
                      className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <PlayerAvatar
                          name={pl.name}
                          team={pl.team}
                          nbaPlayerId={pl.nbaPlayerId}
                          size={36}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-bold">{pl.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {pl.position} · {pl.team}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div
                          className="text-right tabular-nums"
                          title="Suggested auction value (z-score, last season)"
                        >
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Sug
                          </div>
                          <div className="text-sm font-black text-primary">
                            {sug != null ? `$${sug}` : "—"}
                          </div>
                        </div>
                        {isMyNomination && !activeNom ? (
                          <Button
                            onClick={() => handleNominate(pl)}
                            size="sm"
                            disabled={actionBusy}
                            className="font-bold"
                          >
                            <Gavel className="h-3 w-3" /> Nominate
                          </Button>
                        ) : null}
                      </div>
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

            {/* Bid history */}
            {activeNom && bidHistory.length > 0 && (
              <Card className="mt-4 border-2 p-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Bid history
                </div>
                <ul className="space-y-1 text-sm">
                  {bidHistory.slice(0, 8).map((b) => {
                    const bp = participants.find((p) => p.draft_position === b.team_idx);
                    return (
                      <li key={b.id} className="flex justify-between font-mono">
                        <span className="font-bold">
                          {bp?.team_name ?? `Team ${b.team_idx}`}
                        </span>
                        <span className="text-primary font-black">${b.amount}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </div>

          {/* Right rail: budgets + my team */}
          <div className={mobileTab !== "players" ? "" : "hidden lg:block"}>
            <Card className="border-2 p-4">
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
                  const isNom = idx === nominatorTeamIdx;
                  const isHigh =
                    activeNom && activeNom.current_bidder_team_idx === idx;
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
                        {isNom && !activeNom && (
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

            {myTeamIdx && (
              <Card className="mt-4 border-2 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    My roster
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">
                    {myPickCount}/{totalSlots}
                  </span>
                </div>
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
          </div>
        </div>

        {isComplete && (
          <Card className="mt-8 border-2 p-6 text-center">
            <Trophy className="mx-auto h-10 w-10 text-primary" />
            <div className="mt-2 text-2xl font-black">Auction complete!</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Export your results to import into your league platform.
            </p>
          </Card>
        )}
      </main>
    </div>
  );
}
