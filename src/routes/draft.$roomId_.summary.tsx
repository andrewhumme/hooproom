import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ensureGuestSession } from "@/lib/guestSession";
import { downloadDraftXlsx, type PickRow as ExportPickRow } from "@/lib/draftExport";
import {
  assignPicksToSlots,
  buildSlotSpots,
  totalSlots,
  type SlotConfig,
} from "@/lib/rosterSlots";
import {
  fetchLatestStatsForPlayersServer,
  type PlayerSeasonStats,
} from "@/lib/playerStats.functions";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Flame,
  Loader2,
  Trophy,
  Crown,
  Zap,
  DollarSign,
} from "lucide-react";

export const Route = createFileRoute("/draft/$roomId_/summary")({
  component: DraftSummaryPage,
  head: () => ({
    meta: [
      { title: "Draft Summary — HoopRoom" },
      { name: "description", content: "Post-draft recap of all teams and picks." },
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
  draft_format: string;
  auction_budget: number;
  slots_pg: number;
  slots_sg: number;
  slots_g: number;
  slots_sf: number;
  slots_pf: number;
  slots_f: number;
  slots_c: number;
  slots_flx: number;
  slots_bn: number;
  completed_at: string | null;
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

function DraftSummaryPage() {
  const { roomId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();

  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsByPlayer, setStatsByPlayer] = useState<Record<string, PlayerSeasonStats>>({});
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [initedCollapse, setInitedCollapse] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await ensureGuestSession();
      const [r, p, pk] = await Promise.all([
        supabase.from("draft_rooms").select("*").eq("id", roomId).single(),
        supabase.from("draft_participants").select("*").eq("room_id", roomId),
        supabase
          .from("draft_picks")
          .select("*")
          .eq("room_id", roomId)
          .order("pick_number"),
      ]);
      if (!mounted) return;
      if (r.error) {
        setError("Room not found");
        setLoading(false);
        return;
      }
      setRoom(r.data as Room);
      setParticipants((p.data ?? []) as Participant[]);
      setPicks((pk.data ?? []) as Pick[]);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [roomId]);

  // Load season stats for every drafted player (needed to compute team totals
  // and league maxes for the heatmap). Only the user's own team shows the
  // heatmap visualization, so competitors' cards stay untouched.
  useEffect(() => {
    if (picks.length === 0) return;
    const keys = Array.from(new Set(picks.map((p) => p.player_id)));
    if (keys.length === 0) return;
    let cancelled = false;
    fetchLatestStatsForPlayersServer({ data: { playerKeys: keys } })
      .then((res) => {
        if (!cancelled) setStatsByPlayer(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [picks]);

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
  const rosterSlotCount = slotCfg ? totalSlots(slotCfg) : room?.rounds ?? 0;

  const slotMap = useMemo(() => {
    const m = new Map<number, Participant>();
    for (const p of participants) {
      if (p.draft_position != null) m.set(p.draft_position, p);
    }
    return m;
  }, [participants]);

  const isAuction =
    room?.draft_format === "auction" || room?.draft_format === "auction_slow";

  const myTeamIdx = useMemo(() => {
    if (!user) return null;
    const me = participants.find((p) => p.user_id === user.id);
    return me?.draft_position ?? null;
  }, [participants, user]);

  const teamIndexes = useMemo(() => {
    if (!room) return [] as number[];
    const idxs: number[] = [];
    for (let i = 1; i <= room.team_count; i++) idxs.push(i);
    // Move user's team to front if joined.
    if (myTeamIdx != null) {
      return [myTeamIdx, ...idxs.filter((i) => i !== myTeamIdx)];
    }
    return idxs;
  }, [room, myTeamIdx]);

  // Default collapse: only user's team open. All others collapsed. Runs once
  // after room + user are resolved.
  useEffect(() => {
    if (initedCollapse || !room) return;
    const s = new Set<number>();
    for (let i = 1; i <= room.team_count; i++) {
      if (i !== myTeamIdx) s.add(i);
    }
    setCollapsed(s);
    setInitedCollapse(true);
  }, [room, myTeamIdx, initedCollapse]);

  // Per-team category totals from drafted players' latest-season per-game
  // averages. Sums for counting stats; games-weighted averages for pcts.
  const teamTotals = useMemo(() => {
    const out = new Map<number, TeamCategoryTotals>();
    if (!room) return out;
    for (let idx = 1; idx <= room.team_count; idx++) {
      const teamPicks = picks.filter((p) => p.team_idx === idx);
      out.set(idx, computeTeamTotals(teamPicks, statsByPlayer));
    }
    return out;
  }, [room, picks, statsByPlayer]);

  // Category maxes across the whole league — used to shade my-team heatmap
  // relative to the pool that was actually drafted here.
  const catMax = useMemo(() => {
    const keys: (keyof TeamCategoryTotals)[] = [
      "pts", "reb", "ast", "stl", "blk", "fg3_made", "fg_pct", "ft_pct",
    ];
    const m: Partial<Record<keyof TeamCategoryTotals, number>> = {};
    for (const k of keys) {
      let max = 0;
      for (const t of teamTotals.values()) {
        const v = t[k];
        if (v != null && v > max) max = v;
      }
      m[k] = max;
    }
    return m as Record<keyof TeamCategoryTotals, number>;
  }, [teamTotals]);

  const autopickCount = picks.filter((p) => p.was_autopick).length;
  const totalSpent = isAuction
    ? picks.reduce((s, p) => s + (p.auction_price ?? 0), 0)
    : 0;

  const toggleCollapse = (idx: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleExport = () => {
    if (!room) return;
    const teamNameByIdx = new Map<number, string>();
    for (const p of participants) {
      if (p.draft_position != null) teamNameByIdx.set(p.draft_position, p.team_name);
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
      auction_price: pk.auction_price,
    }));
    downloadDraftXlsx(
      {
        roomName: room.name,
        draftFormat: room.draft_format,
        scoringFormat: room.scoring_format,
        teamCount: room.team_count,
        rounds: room.rounds,
        pickClockSec: room.pick_clock_sec,
        budget: isAuction ? room.auction_budget : undefined,
        completedAt: room.completed_at,
      },
      rows,
    );
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen bg-background">
        <Card className="mx-auto mt-20 max-w-md p-8 text-center">
          <p className="text-lg font-black">{error ?? "Room not found"}</p>
          <Button asChild variant="outline" className="mt-4 font-bold">
            <Link to="/lobby">
              <ArrowLeft /> Back to lobby
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  const isComplete = room.status === "complete";
  const completedLabel = room.completed_at
    ? new Date(room.completed_at).toLocaleString()
    : null;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Hero */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="font-bold">
              <Link to="/draft/$roomId" params={{ roomId }}>
                <ArrowLeft /> Draft room
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="font-bold">
              <Link to="/lobby">Lobby</Link>
            </Button>
            <Button onClick={handleExport} className="font-bold">
              <Download /> Export XLSX
            </Button>
          </div>
        </div>

        <Card className="mt-6 border-2 border-primary/40 bg-gradient-to-br from-primary/10 to-transparent p-8 text-center">
          <Trophy className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            {isComplete ? "Draft Complete" : "Draft In Progress"}
          </h1>
          <p className="mt-2 text-base font-bold text-muted-foreground">{room.name}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
            <Badge variant="secondary" className="font-bold">
              {room.draft_format.replace("_", " ").toUpperCase()}
            </Badge>
            <Badge variant="secondary" className="font-bold">
              {room.team_count} teams · {rosterSlotCount} slots
            </Badge>
            <Badge variant="secondary" className="font-bold">
              {room.scoring_format}
            </Badge>
            {completedLabel && (
              <Badge variant="outline" className="font-bold">
                Completed {completedLabel}
              </Badge>
            )}
          </div>

          {/* Quick stats */}
          <div className="mx-auto mt-6 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBlock label="Total picks" value={String(picks.length)} />
            <StatBlock label="Teams" value={String(room.team_count)} />
            <StatBlock
              label="Autopicks"
              value={String(autopickCount)}
              icon={<Zap className="h-3.5 w-3.5" />}
            />
            {isAuction ? (
              <StatBlock
                label="Total spent"
                value={`$${totalSpent}`}
                icon={<DollarSign className="h-3.5 w-3.5" />}
              />
            ) : (
              <StatBlock label="Rounds" value={String(room.rounds)} />
            )}
          </div>
        </Card>

        {/* Teams grid */}
        <h2 className="mt-10 text-xl font-black">
          {myTeamIdx != null ? "Your team & the rest of the league" : "All teams"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap any roster to see how it stacks up by position slot.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teamIndexes.map((teamIdx) => {
            const team = slotMap.get(teamIdx);
            const teamPicks = picks
              .filter((p) => p.team_idx === teamIdx)
              .sort((a, b) => a.pick_number - b.pick_number);
            const teamAutopicks = teamPicks.filter((p) => p.was_autopick).length;
            const teamSpend = isAuction
              ? teamPicks.reduce((s, p) => s + (p.auction_price ?? 0), 0)
              : 0;
            const isMine = myTeamIdx === teamIdx;
            return (
              <Card
                key={teamIdx}
                className={
                  isMine
                    ? "border-2 border-primary p-0 shadow-lg"
                    : "border-border p-0"
                }
              >
                <div
                  className={`flex items-center justify-between gap-2 rounded-t-lg px-4 py-3 ${
                    isMine ? "bg-primary/10" : "bg-muted/40"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {isMine && <Crown className="h-4 w-4 text-primary" />}
                      <div className="truncate text-sm font-black">
                        {team?.team_name ?? `Team ${teamIdx} (Auto)`}
                      </div>
                    </div>
                    <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Slot #{teamIdx} · {teamPicks.length}/{rosterSlotCount} picks
                      {teamAutopicks > 0 && (
                        <span className="ml-1 text-primary">· {teamAutopicks} auto</span>
                      )}
                    </div>
                  </div>
                  {isAuction && (
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground">
                        Spent
                      </div>
                      <div className="text-sm font-black">${teamSpend}</div>
                    </div>
                  )}
                </div>
                {teamPicks.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No picks.
                  </div>
                ) : slotCfg ? (
                  <RosterSlotList
                    picks={teamPicks}
                    cfg={slotCfg}
                    teamCount={room.team_count}
                    showPrice={isAuction}
                  />
                ) : null}
              </Card>
            );
          })}
        </div>

        {/* Full draft order */}
        <h2 className="mt-10 text-xl font-black">Full draft order</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every pick, in the order it happened.
        </p>
        <Card className="mt-4 overflow-hidden p-0">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="text-left text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Rnd</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">NBA</th>
                  {isAuction && <th className="px-3 py-2 text-right">$</th>}
                </tr>
              </thead>
              <tbody>
                {picks.map((pk) => {
                  const team = slotMap.get(pk.team_idx);
                  const isMine = myTeamIdx === pk.team_idx;
                  return (
                    <tr
                      key={pk.id}
                      className={`border-t border-border ${
                        isMine ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-mono font-bold tabular-nums">
                        {pk.pick_number}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{pk.round}</td>
                      <td className="px-3 py-2 font-bold">
                        {team?.team_name ?? `Team ${pk.team_idx}`}
                      </td>
                      <td className="px-3 py-2 font-bold">
                        {pk.player_name}
                        {pk.was_autopick && (
                          <Zap className="ml-1 inline h-3 w-3 text-primary" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {pk.player_position ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {pk.player_team ?? "—"}
                      </td>
                      {isAuction && (
                        <td className="px-3 py-2 text-right font-mono font-bold tabular-nums">
                          ${pk.auction_price ?? 0}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}

function StatBlock({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
      <div className="flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-black">{value}</div>
    </div>
  );
}

function pickInRound(pk: { pick_number: number }, teamCount: number) {
  return ((pk.pick_number - 1) % teamCount) + 1;
}

function RosterSlotList({
  picks,
  cfg,
  teamCount,
  showPrice,
}: {
  picks: Pick[];
  cfg: SlotConfig;
  teamCount: number;
  showPrice: boolean;
}) {
  const spots = buildSlotSpots(cfg);
  const assigned = assignPicksToSlots(picks, cfg);
  const bySpot = new Map<string, Pick>();
  const overflow: Pick[] = [];
  for (const a of assigned) {
    if (a.spotKey) bySpot.set(a.spotKey, a.pick as Pick);
    else overflow.push(a.pick as Pick);
  }
  return (
    <ul className="divide-y divide-border">
      {spots.map((spot) => {
        const pk = bySpot.get(spot.key);
        return (
          <li key={spot.key} className="flex items-center gap-3 px-4 py-2">
            <span
              className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-[10px] font-black ${
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
                    <div className="flex shrink-0 items-center gap-1">
                      {showPrice && (
                        <Badge className="font-bold">${pk.auction_price ?? 0}</Badge>
                      )}
                      <Badge variant="outline" className="font-bold">
                        {pk.player_team ?? "—"}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
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
                <div className="text-xs italic text-muted-foreground">
                  Empty · {spot.pos}
                </div>
              )}
            </div>
          </li>
        );
      })}
      {overflow.map((pk) => (
        <li key={pk.id} className="flex items-center gap-3 bg-destructive/5 px-4 py-2">
          <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-md bg-destructive/20 text-[10px] font-black text-destructive">
            BN
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-sm font-bold">{pk.player_name}</div>
              {showPrice && (
                <Badge className="shrink-0 font-bold">${pk.auction_price ?? 0}</Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {pk.player_position ?? "—"} · R{pk.round} · #{pk.pick_number} · overflow
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
