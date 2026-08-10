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
  BarChart3,
  ChevronDown,
  ChevronRight,
  Download,
  Flame,
  Loader2,
  Trophy,
  Crown,
  Zap,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

export const Route = createFileRoute("/draft/$roomId_/summary")({
  component: DraftSummaryPage,
  head: () => ({
    meta: [
      { title: "Draft Report Card — HoopRoom" },
      {
        name: "description",
        content:
          "Post-draft recap with team standings, category heatmap, and how your picks are aging across the season.",
      },
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

  // Default collapse: on mobile, only the user's team is open; on desktop,
  // all teams are expanded so the summary is scannable at a glance. Runs once
  // after room + user are resolved.
  useEffect(() => {
    if (initedCollapse || !room) return;
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;
    const s = new Set<number>();
    if (!isDesktop) {
      for (let i = 1; i <= room.team_count; i++) {
        if (i !== myTeamIdx) s.add(i);
      }
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

        {/* Standings — live category leaderboard using season-to-date per-game
            averages. Refreshes automatically as the season progresses. */}
        {picks.length > 0 && (
          <StandingsSection
            teamIndexes={Array.from({ length: room.team_count }, (_, i) => i + 1)}
            teamTotals={teamTotals}
            slotMap={slotMap}
            myTeamIdx={myTeamIdx}
          />
        )}

        {/* Teams grid */}
        <h2 className="mt-10 text-xl font-black">
          {myTeamIdx != null ? "Your team & the rest of the league" : "All teams"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap a team header to expand or collapse its roster.
          {myTeamIdx != null &&
            " Your team also shows a category heatmap and how each pick is aging vs. the rest of the drafted pool."}
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
            const isCollapsed = collapsed.has(teamIdx);
            const totals = teamTotals.get(teamIdx);
            return (
              <Card
                key={teamIdx}
                className={
                  isMine
                    ? "border-2 border-primary p-0 shadow-lg"
                    : "border-border p-0"
                }
              >
                <button
                  type="button"
                  onClick={() => toggleCollapse(teamIdx)}
                  className={`flex w-full items-center justify-between gap-2 rounded-t-lg px-4 py-3 text-left transition hover:bg-muted/60 ${
                    isMine ? "bg-primary/10" : "bg-muted/40"
                  }`}
                  aria-expanded={!isCollapsed}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
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
                          <span className="ml-1 text-primary">
                            · {teamAutopicks} auto
                          </span>
                        )}
                      </div>
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
                </button>
                {!isCollapsed && (
                  <>
                    {isMine && totals && teamPicks.length > 0 && (
                      <CategoryHeatmap
                        totals={totals}
                        allTotals={Array.from(teamTotals.values())}
                      />
                    )}
                    {isMine && teamPicks.length > 0 && (
                      <AgingPicks
                        picks={teamPicks}
                        allPicks={picks}
                        statsByPlayer={statsByPlayer}
                        teamCount={room.team_count}
                      />
                    )}
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
                  </>
                )}
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
            OVER
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

// ---------- Category heatmap helpers ----------

type TeamCategoryTotals = {
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  fg3_made: number | null;
  fg_pct: number | null;
  ft_pct: number | null;
};

const CAT_META: {
  key: keyof TeamCategoryTotals;
  label: string;
  decimals: number;
  isPct?: boolean;
}[] = [
  { key: "pts", label: "PTS", decimals: 1 },
  { key: "reb", label: "REB", decimals: 1 },
  { key: "ast", label: "AST", decimals: 1 },
  { key: "stl", label: "STL", decimals: 1 },
  { key: "blk", label: "BLK", decimals: 1 },
  { key: "fg3_made", label: "3PM", decimals: 1 },
  { key: "fg_pct", label: "FG%", decimals: 3, isPct: true },
  { key: "ft_pct", label: "FT%", decimals: 3, isPct: true },
];

function computeTeamTotals(
  teamPicks: Pick[],
  statsByPlayer: Record<string, PlayerSeasonStats>,
): TeamCategoryTotals {
  const sums: Record<string, number> = {
    pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fg3_made: 0,
  };
  let fgAttWeighted = 0;
  let ftAttWeighted = 0;
  let fgWeight = 0;
  let ftWeight = 0;
  let count = 0;
  for (const p of teamPicks) {
    const s = statsByPlayer[p.player_id];
    if (!s) continue;
    count++;
    sums.pts += s.pts ?? 0;
    sums.reb += s.reb ?? 0;
    sums.ast += s.ast ?? 0;
    sums.stl += s.stl ?? 0;
    sums.blk += s.blk ?? 0;
    sums.fg3_made += s.fg3_made ?? 0;
    // Weight FG% / FT% by games played so heavier contributors count more.
    const gp = s.games_played ?? 0;
    if (s.fg_pct != null && gp > 0) {
      fgAttWeighted += s.fg_pct * gp;
      fgWeight += gp;
    }
    if (s.ft_pct != null && gp > 0) {
      ftAttWeighted += s.ft_pct * gp;
      ftWeight += gp;
    }
  }
  if (count === 0) {
    return {
      pts: null, reb: null, ast: null, stl: null, blk: null,
      fg3_made: null, fg_pct: null, ft_pct: null,
    };
  }
  return {
    pts: sums.pts,
    reb: sums.reb,
    ast: sums.ast,
    stl: sums.stl,
    blk: sums.blk,
    fg3_made: sums.fg3_made,
    fg_pct: fgWeight > 0 ? fgAttWeighted / fgWeight : null,
    ft_pct: ftWeight > 0 ? ftAttWeighted / ftWeight : null,
  };
}

function CategoryHeatmap({
  totals,
  allTotals,
}: {
  totals: TeamCategoryTotals;
  allTotals: TeamCategoryTotals[];
}) {
  // Rank-based diverging color: red (bottom) → amber (mid) → green (top)
  // within the league. Falls back to neutral when only one team has picked
  // or the category has no data.
  const rankedTeams = allTotals.length;
  return (
    <div className="border-b border-border bg-background/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        <Flame className="h-3 w-3 text-primary" />
        Category heatmap
        <span className="ml-auto text-[9px] font-bold normal-case tracking-normal text-muted-foreground/70">
          vs. league rank
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {CAT_META.map((c) => {
          const v = totals[c.key];
          const values = allTotals
            .map((t) => t[c.key])
            .filter((n): n is number => n != null);
          let percentile: number | null = null;
          if (v != null && values.length > 1) {
            const sorted = [...values].sort((a, b) => a - b);
            const first = sorted.indexOf(v);
            const last = sorted.lastIndexOf(v);
            const avgRank = (first + last) / 2;
            percentile = avgRank / (sorted.length - 1);
          }
          let bg = "transparent";
          let ring = "border-border/70";
          if (percentile != null) {
            const hue = 15 + percentile * 130;
            const alpha = 0.18 + Math.abs(percentile - 0.5) * 0.35;
            bg = `oklch(0.72 0.16 ${hue.toFixed(1)} / ${alpha.toFixed(2)})`;
            if (percentile >= 0.75) ring = "border-emerald-500/50";
            else if (percentile <= 0.25) ring = "border-red-500/50";
          }
          const formatted =
            v == null
              ? "—"
              : c.isPct
                ? v.toFixed(3).replace(/^0\./, ".")
                : v.toFixed(c.decimals);
          const rankLabel =
            percentile == null
              ? ""
              : ` · rank ${Math.round((1 - percentile) * (rankedTeams - 1)) + 1}/${rankedTeams}`;
          return (
            <div
              key={c.key}
              className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1.5 text-center ${ring}`}
              style={{ backgroundColor: bg }}
              title={`${c.label}: ${formatted}${rankLabel}`}
            >
              <span className="w-full truncate text-sm font-black tabular-nums leading-none">
                {formatted}
              </span>
              <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                {c.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Standings ----------
// Fantasy-basketball "category wins" scoring: each team is compared head-to-head
// against every other team across the 8 tracked categories. Wins tallied,
// leaderboard sorted. Refreshes automatically as season stats update.

function StandingsSection({
  teamIndexes,
  teamTotals,
  slotMap,
  myTeamIdx,
}: {
  teamIndexes: number[];
  teamTotals: Map<number, TeamCategoryTotals>;
  slotMap: Map<number, Participant>;
  myTeamIdx: number | null;
}) {
  // Wins per team across all categories (higher = better; TOV would flip, but
  // we don't track TOV in the heatmap set today).
  const wins = new Map<number, number>();
  teamIndexes.forEach((i) => wins.set(i, 0));
  for (const cat of CAT_META) {
    for (const a of teamIndexes) {
      const va = teamTotals.get(a)?.[cat.key];
      if (va == null) continue;
      for (const b of teamIndexes) {
        if (a === b) continue;
        const vb = teamTotals.get(b)?.[cat.key];
        if (vb == null) continue;
        if (va > vb) wins.set(a, (wins.get(a) ?? 0) + 1);
      }
    }
  }
  const maxWins = CAT_META.length * (teamIndexes.length - 1);
  const ranked = [...teamIndexes]
    .map((idx) => ({
      idx,
      wins: wins.get(idx) ?? 0,
      totals: teamTotals.get(idx),
    }))
    .sort((a, b) => b.wins - a.wins);

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-black">Category standings</h2>
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Season-to-date
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Head-to-head category wins across every team's drafted roster. Updates
        as the NBA season progresses — no manual scoring needed.
      </p>
      <Card className="mt-4 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/60 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2 text-right">Cat wins</th>
                <th className="px-3 py-2 text-right w-32">Strength</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((row, i) => {
                const team = slotMap.get(row.idx);
                const isMine = myTeamIdx === row.idx;
                const pct = maxWins > 0 ? row.wins / maxWins : 0;
                return (
                  <tr
                    key={row.idx}
                    className={`border-t border-border ${isMine ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-3 py-2 font-mono font-black tabular-nums">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {isMine && <Crown className="h-3.5 w-3.5 text-primary" />}
                        <span className="font-black">
                          {team?.team_name ?? `Team ${row.idx}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-black tabular-nums">
                      {row.wins}
                      <span className="ml-1 text-[10px] font-bold text-muted-foreground">
                        / {maxWins}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="ml-auto h-1.5 w-full max-w-[6rem] overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.round(pct * 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

// ---------- Aging picks (My Team only) ----------
// Grades each drafted player by how their season-to-date 9-cat value compares
// to their draft slot. Player value = sum of category percentile ranks vs.
// every other drafted player in the room.

type AgingRow = {
  pick: Pick;
  value: number | null; // 0..1 (avg of category percentiles)
  valueRank: number | null; // 1 = best
  totalDrafted: number;
  grade: "steal" | "solid" | "fair" | "reach" | "bust" | "unranked";
};

const GRADE_META: Record<
  AgingRow["grade"],
  { label: string; cls: string; icon: React.ReactNode }
> = {
  steal: {
    label: "Steal",
    cls: "border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    icon: <TrendingUp className="h-3 w-3" />,
  },
  solid: {
    label: "Solid",
    cls: "border-primary/50 bg-primary/10 text-primary",
    icon: <TrendingUp className="h-3 w-3" />,
  },
  fair: {
    label: "Fair",
    cls: "border-border bg-muted text-muted-foreground",
    icon: <Minus className="h-3 w-3" />,
  },
  reach: {
    label: "Reach",
    cls: "border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    icon: <TrendingDown className="h-3 w-3" />,
  },
  bust: {
    label: "Bust",
    cls: "border-red-500/60 bg-red-500/10 text-red-600 dark:text-red-400",
    icon: <TrendingDown className="h-3 w-3" />,
  },
  unranked: {
    label: "No data",
    cls: "border-dashed border-border bg-transparent text-muted-foreground",
    icon: <Minus className="h-3 w-3" />,
  },
};

function computePlayerPercentileValue(
  s: PlayerSeasonStats | undefined,
  allStats: PlayerSeasonStats[],
): number | null {
  if (!s) return null;
  let sum = 0;
  let count = 0;
  for (const c of CAT_META) {
    const v = s[c.key as keyof PlayerSeasonStats] as number | null | undefined;
    if (v == null) continue;
    const pool = allStats
      .map((x) => x[c.key as keyof PlayerSeasonStats] as number | null | undefined)
      .filter((n): n is number => n != null);
    if (pool.length < 2) continue;
    const sorted = [...pool].sort((a, b) => a - b);
    const first = sorted.indexOf(v);
    const last = sorted.lastIndexOf(v);
    const avgRank = (first + last) / 2;
    const pct = avgRank / (sorted.length - 1);
    sum += pct;
    count++;
  }
  if (count === 0) return null;
  return sum / count;
}

function AgingPicks({
  picks,
  allPicks,
  statsByPlayer,
  teamCount,
}: {
  picks: Pick[];
  allPicks: Pick[];
  statsByPlayer: Record<string, PlayerSeasonStats>;
  teamCount: number;
}) {
  // Rank every drafted player in the room by percentile-value.
  const draftedStats: { pick: Pick; stats?: PlayerSeasonStats; value: number | null }[] =
    allPicks.map((p) => {
      const stats = statsByPlayer[p.player_id];
      return { pick: p, stats, value: null };
    });
  const allStatsArr = draftedStats
    .map((d) => d.stats)
    .filter((s): s is PlayerSeasonStats => !!s);
  draftedStats.forEach((d) => {
    d.value = computePlayerPercentileValue(d.stats, allStatsArr);
  });
  const ranked = draftedStats
    .filter((d) => d.value != null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const rankByPickId = new Map<string, number>();
  ranked.forEach((d, i) => rankByPickId.set(d.pick.id, i + 1));
  const totalDrafted = ranked.length;

  const rows: AgingRow[] = picks
    .slice()
    .sort((a, b) => a.pick_number - b.pick_number)
    .map((pk) => {
      const value = draftedStats.find((d) => d.pick.id === pk.id)?.value ?? null;
      const valueRank = rankByPickId.get(pk.id) ?? null;
      let grade: AgingRow["grade"] = "unranked";
      if (valueRank != null && totalDrafted > 0) {
        // Compare value-rank to draft slot. Delta > 0 means player is
        // outperforming where they were taken.
        const delta = pk.pick_number - valueRank;
        if (delta >= 15) grade = "steal";
        else if (delta >= 5) grade = "solid";
        else if (delta >= -5) grade = "fair";
        else if (delta >= -15) grade = "reach";
        else grade = "bust";
      }
      return { pick: pk, value, valueRank, totalDrafted, grade };
    });

  const hasAnyData = rows.some((r) => r.valueRank != null);

  return (
    <div className="border-b border-border bg-background/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        <BarChart3 className="h-3 w-3 text-primary" />
        Your picks, aging
        <span className="ml-auto text-[9px] font-bold normal-case tracking-normal text-muted-foreground/70">
          Grade vs. draft slot
        </span>
      </div>
      {!hasAnyData ? (
        <p className="text-xs italic text-muted-foreground">
          Season stats not available yet for these picks.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((r) => {
            const g = GRADE_META[r.grade];
            return (
              <li
                key={r.pick.id}
                className="flex items-center gap-2 py-1.5 text-xs"
              >
                <span className="w-10 shrink-0 font-mono font-bold tabular-nums text-muted-foreground">
                  R{r.pick.round}.{pickInRound(r.pick, teamCount)}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold">
                  {r.pick.player_name}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  {r.valueRank != null
                    ? `#${r.valueRank}/${r.totalDrafted}`
                    : "—"}
                </span>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${g.cls}`}
                >
                  {g.icon}
                  {g.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

