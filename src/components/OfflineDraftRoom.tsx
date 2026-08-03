import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { fetchActivePlayersServer } from "@/lib/players.functions";
import { compareByRank } from "@/lib/playerRankings";
import type { DraftablePlayer } from "@/lib/balldontlie";
import {
  assignPicksToSlots,
  buildSlotSpots,
  eligibleSlotsForPosition,
  type SlotConfig,
  type SlotKey,
} from "@/lib/rosterSlots";
import { downloadDraftXlsx } from "@/lib/draftExport";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Loader2,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Search,
  Tablet,
  Trophy,
  Undo2,
  Users,
} from "lucide-react";

type Room = {
  player_pool?: string | null;
  id: string;
  name: string;
  host_user_id: string;
  team_count: number;
  rounds: number;
  pick_clock_sec: number;
  scoring_format: string;
  status: "waiting" | "drafting" | "paused" | "complete";
  current_pick_number: number;
  draft_mode: string;
  layout_preference: string | null;
  clock_running: boolean;
  clock_started_at: string | null;
  clock_elapsed_ms: number;
  reversal_rounds: number[] | null;
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
  user_id: string | null;
  draft_position: number | null;
  team_name: string;
  owner_email: string | null;
  share_token: string;
};

type Pick = {
  id: string;
  pick_number: number;
  round: number;
  team_idx: number;
  player_id: string;
  player_name: string;
  player_position: string | null;
  player_team: string | null;
  picked_at: string;
};

function isReverseRound(round: number, reversals: number[] | null | undefined): boolean {
  const set = new Set(reversals ?? []);
  if (round % 2 === 0) return !set.has(round);
  return set.has(round);
}

function teamForPick(pickNumber: number, teamCount: number, reversals: number[] | null | undefined) {
  const round = Math.floor((pickNumber - 1) / teamCount) + 1;
  const idx = (pickNumber - 1) % teamCount;
  return isReverseRound(round, reversals) ? teamCount - idx : idx + 1;
}

interface Props {
  room: Room;
  participants: Participant[];
  picks: Pick[];
  isHost: boolean;
}

export function OfflineDraftRoom({ room, participants, picks, isHost }: Props) {
  const navigate = useNavigate();
  const [layout, setLayout] = useState<"board" | "console">(
    (room.layout_preference as "board" | "console") ?? "board"
  );
  const [players, setPlayers] = useState<DraftablePlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [tick, setTick] = useState(0);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Load player pool once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchActivePlayersServer({
          data: { pool: room.player_pool === "rookies" ? "rookies" : "all" },
        });
        if (!cancelled) {
          setPlayers([...list].sort(compareByRank));
        }
      } catch (e) {
        console.error("failed to load players", e);
      } finally {
        if (!cancelled) setPlayersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room.player_pool]);

  // Tick for clock display
  useEffect(() => {
    if (!room.clock_running) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [room.clock_running]);

  const slotConfig: SlotConfig = useMemo(
    () => ({
      PG: room.slots_pg,
      SG: room.slots_sg,
      G: room.slots_g,
      SF: room.slots_sf,
      PF: room.slots_pf,
      F: room.slots_f,
      C: room.slots_c,
      FLX: room.slots_flx,
      BN: room.slots_bn,
    }),
    [room]
  );

  const totalPicks = room.team_count * room.rounds;
  const isComplete = room.status === "complete" || room.current_pick_number > totalPicks;

  const onClockTeamIdx = useMemo(() => {
    if (isComplete || room.status !== "drafting") return null;
    return teamForPick(room.current_pick_number, room.team_count, room.reversal_rounds);
  }, [room, isComplete]);

  const onClockTeam = useMemo(
    () => participants.find((p) => p.draft_position === onClockTeamIdx) ?? null,
    [participants, onClockTeamIdx]
  );

  const takenIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);

  // Filter available players
  const availablePlayers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return players.filter((p) => {
      if (takenIds.has(p.id)) return false;
      if (term && !p.name.toLowerCase().includes(term)) return false;
      if (posFilter !== "ALL") {
        const eligible = eligibleSlotsForPosition(p.position);
        if (!eligible.includes(posFilter as SlotKey)) return false;
      }
      return true;
    });
  }, [players, takenIds, search, posFilter]);

  // Roster for on-clock team, to derive slot eligibility for pick button
  const onClockPicks = useMemo(
    () =>
      onClockTeamIdx == null
        ? []
        : picks.filter((p) => p.team_idx === onClockTeamIdx),
    [picks, onClockTeamIdx]
  );

  const onClockOpenSlots = useMemo(() => {
    if (onClockTeamIdx == null) return new Set<SlotKey>();
    const assigned = assignPicksToSlots(onClockPicks, slotConfig);
    const taken = new Set(assigned.map((a) => a.spotKey).filter(Boolean));
    const spots = buildSlotSpots(slotConfig);
    const openPositions = new Set<SlotKey>();
    for (const s of spots) if (!taken.has(s.key)) openPositions.add(s.pos);
    return openPositions;
  }, [onClockPicks, onClockTeamIdx, slotConfig]);

  const canDraftPlayer = useCallback(
    (p: DraftablePlayer) => {
      if (onClockOpenSlots.size === 0) return false;
      const elig = eligibleSlotsForPosition(p.position);
      // If any of eligible positions has an open specific slot OR FLX/BN open, allow
      if (onClockOpenSlots.has("FLX") || onClockOpenSlots.has("BN")) return true;
      for (const e of elig) {
        if (onClockOpenSlots.has(e)) return true;
      }
      if ((elig.includes("PG") || elig.includes("SG")) && onClockOpenSlots.has("G")) return true;
      if ((elig.includes("SF") || elig.includes("PF")) && onClockOpenSlots.has("F")) return true;
      return false;
    },
    [onClockOpenSlots]
  );

  // Elapsed ms across pause/resume
  const displayElapsedMs = useMemo(() => {
    if (!room.clock_running || !room.clock_started_at) return room.clock_elapsed_ms;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = tick;
    return room.clock_elapsed_ms + (Date.now() - new Date(room.clock_started_at).getTime());
  }, [room.clock_running, room.clock_started_at, room.clock_elapsed_ms, tick]);

  // ---- Actions ----
  const handleStart = async () => {
    if (!isHost || starting) return;
    setStarting(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("draft_rooms")
        .update({ status: "drafting", started_at: new Date().toISOString(), current_pick_number: 1 })
        .eq("id", room.id);
      if (error) throw error;
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to start draft");
    } finally {
      setStarting(false);
    }
  };

  const handleDraft = async (player: DraftablePlayer) => {
    if (!isHost || busy) return;
    if (!canDraftPlayer(player)) return;
    setBusy(true);
    setError(null);
    try {
      // Reset clock on each pick
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
      await rpc("set_offline_clock", {
        _room_id: room.id,
        _running: false,
        _reset: true,
      });
      const { error: pickErr } = await rpc("make_offline_pick", {
        _room_id: room.id,
        _player_id: player.id,
        _player_name: player.name,
        _player_position: player.position,
        _player_team: player.team,
      });
      if (pickErr) throw pickErr;
      setSearch("");
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to draft");
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    if (!isHost || busy) return;
    if (!confirm("Undo the last pick?")) return;
    setBusy(true);
    setError(null);
    try {
      const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
      const { error } = await rpc("undo_last_offline_pick", {
        _room_id: room.id,
      });
      if (error) throw error;
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to undo");
    } finally {
      setBusy(false);
    }
  };

  const handleClock = async (action: "start" | "pause" | "reset") => {
    if (!isHost) return;
    try {
      const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
      await rpc("set_offline_clock", {
        _room_id: room.id,
        _running: action === "start",
        _reset: action === "reset",
      });
    } catch (e) {
      console.error(e);
    }
  };

  const copyRosterLink = async (token: string) => {
    const url = `${window.location.origin}/roster/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1600);
    } catch {
      window.prompt("Copy this roster link:", url);
    }
  };

  const exportBoard = () => {
    downloadDraftXlsx(
      {
        roomName: room.name,
        draftFormat: "offline",
        scoringFormat: room.scoring_format,
        teamCount: room.team_count,
        rounds: room.rounds,
        pickClockSec: room.pick_clock_sec,
      },
      picks.map((p) => ({
        pick_number: p.pick_number,
        round: p.round,
        team_idx: p.team_idx,
        team_name:
          participants.find((x) => x.draft_position === p.team_idx)?.team_name ??
          `Team ${p.team_idx}`,
        player_name: p.player_name,
        player_position: p.player_position,
        player_team: p.player_team,
        was_autopick: false,
      })),
    );
  };

  const clockSec = Math.floor(displayElapsedMs / 1000);
  const clockMm = String(Math.floor(clockSec / 60)).padStart(2, "0");
  const clockSs = String(clockSec % 60).padStart(2, "0");

  // ---- Waiting screen ----
  if (room.status === "waiting") {
    return (
      <WaitingScreen
        room={room}
        participants={participants}
        isHost={isHost}
        starting={starting}
        error={error}
        onStart={handleStart}
        onCopyLink={copyRosterLink}
        copiedToken={copiedToken}
        navigate={navigate}
      />
    );
  }

  // ---- Shared header ----
  const header = (
    <header className="sticky top-0 z-30 border-b-2 border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
        <Link
          to="/me"
          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Exit
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge className="bg-primary/15 text-primary hover:bg-primary/20">In person</Badge>
            <h1 className="truncate text-sm font-black md:text-base">{room.name}</h1>
          </div>
        </div>
        {isHost && !isComplete && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLayout("board")}
              className={`h-8 px-2 ${layout === "board" ? "border-primary text-primary" : ""}`}
              title="Board layout"
            >
              <Monitor className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLayout("console")}
              className={`h-8 px-2 ${layout === "console" ? "border-primary text-primary" : ""}`}
              title="Console layout"
            >
              <Tablet className="h-4 w-4" />
            </Button>
          </div>
        )}
        <Button size="sm" variant="outline" onClick={exportBoard} className="h-8 font-bold">
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
        {isComplete && (
          <Button
            size="sm"
            className="h-8 font-bold"
            onClick={() =>
              navigate({ to: "/draft/$roomId/summary", params: { roomId: room.id } })
            }
          >
            <Trophy className="h-3.5 w-3.5" /> Summary
          </Button>
        )}
      </div>

      {/* On-the-clock banner */}
      {!isComplete && onClockTeam && (
        <div className="border-t border-border bg-primary/5">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest text-primary">
                On the clock
              </div>
              <div className="truncate text-lg font-black md:text-2xl">
                {onClockTeam.team_name}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Round {Math.floor((room.current_pick_number - 1) / room.team_count) + 1} · Pick{" "}
                {room.current_pick_number} / {totalPicks}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="rounded-lg border-2 border-border bg-background px-3 py-1.5 font-mono text-xl font-black tabular-nums md:text-2xl">
                {clockMm}:{clockSs}
              </div>
              {isHost && (
                <>
                  {room.clock_running ? (
                    <Button size="sm" variant="outline" onClick={() => handleClock("pause")} className="h-9">
                      <Pause className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => handleClock("start")} className="h-9 font-bold">
                      <Play className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleClock("reset")} className="h-9">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );

  if (isComplete) {
    return (
      <div className="min-h-screen bg-background">
        {header}
        <div className="mx-auto max-w-4xl px-6 py-10 text-center">
          <Trophy className="mx-auto h-12 w-12 text-primary" />
          <h2 className="mt-4 text-3xl font-black">Draft complete!</h2>
          <p className="mt-2 text-muted-foreground">
            Head to the summary to see rosters, categories, and grades.
          </p>
          <Button
            size="lg"
            className="mt-6 font-bold"
            onClick={() =>
              navigate({ to: "/draft/$roomId/summary", params: { roomId: room.id } })
            }
          >
            View summary
          </Button>
        </div>
      </div>
    );
  }

  const boardLayout = (
    <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[1fr_380px]">
      <BoardGrid
        room={room}
        participants={participants}
        picks={picks}
        onClockTeamIdx={onClockTeamIdx}
      />
      <PlayerPickPanel
        players={availablePlayers}
        loading={playersLoading}
        search={search}
        onSearch={setSearch}
        posFilter={posFilter}
        onPosFilter={setPosFilter}
        onClockTeam={onClockTeam}
        canDraftPlayer={canDraftPlayer}
        onDraft={handleDraft}
        busy={busy}
        isHost={isHost}
        onUndo={handleUndo}
        picksExist={picks.length > 0}
        error={error}
      />
    </div>
  );

  const consoleLayout = (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <PlayerPickPanel
        players={availablePlayers}
        loading={playersLoading}
        search={search}
        onSearch={setSearch}
        posFilter={posFilter}
        onPosFilter={setPosFilter}
        onClockTeam={onClockTeam}
        canDraftPlayer={canDraftPlayer}
        onDraft={handleDraft}
        busy={busy}
        isHost={isHost}
        onUndo={handleUndo}
        picksExist={picks.length > 0}
        error={error}
        expanded
      />
      <div className="mt-4">
        <TeamRosterQuickView
          participant={onClockTeam}
          picks={onClockPicks}
          slotConfig={slotConfig}
        />
      </div>
      <div className="mt-4">
        <RecentPicks picks={picks} participants={participants} />
      </div>
      <div className="mt-4">
        <TeamShareLinks
          participants={participants}
          onCopy={copyRosterLink}
          copiedToken={copiedToken}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {header}
      {layout === "board" ? boardLayout : consoleLayout}
    </div>
  );
}

// ================= Sub-components =================

function WaitingScreen({
  room,
  participants,
  isHost,
  starting,
  error,
  onStart,
  onCopyLink,
  copiedToken,
  navigate,
}: {
  room: Room;
  participants: Participant[];
  isHost: boolean;
  starting: boolean;
  error: string | null;
  onStart: () => void;
  onCopyLink: (token: string) => void;
  copiedToken: string | null;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const sorted = [...participants].sort(
    (a, b) => (a.draft_position ?? 999) - (b.draft_position ?? 999)
  );
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-2 border-border bg-background">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-4">
          <Link
            to="/me"
            className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Exit
          </Link>
          <Badge className="bg-primary/15 text-primary hover:bg-primary/20">In person</Badge>
          <h1 className="text-lg font-black">{room.name}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-4">
          <h2 className="text-2xl font-black">Draft order</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone drafts in the order below. Share each team's roster link so owners can
            watch their picks come in — no login required.
          </p>
        </div>

        <Card className="border-2">
          <ul className="divide-y divide-border">
            {sorted.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-black text-primary">
                  {p.draft_position}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">
                    {p.team_name}
                    {p.user_id === room.host_user_id && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        Host
                      </Badge>
                    )}
                  </div>
                  {p.owner_email && (
                    <div className="truncate text-xs text-muted-foreground">{p.owner_email}</div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCopyLink(p.share_token)}
                  className="h-8 font-bold"
                >
                  {copiedToken === p.share_token ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Roster link
                    </>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        </Card>

        {error && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {isHost ? (
            <Button
              size="lg"
              className="flex-1 font-bold shadow-[var(--shadow-glow)]"
              onClick={onStart}
              disabled={starting}
            >
              {starting && <Loader2 className="h-4 w-4 animate-spin" />}
              Start draft
            </Button>
          ) : (
            <div className="flex-1 rounded-md border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-center text-sm font-bold text-muted-foreground">
              Waiting for the host to start…
            </div>
          )}
          <Button
            size="lg"
            variant="outline"
            onClick={() => navigate({ to: "/me" })}
            className="font-bold"
          >
            <Users className="h-4 w-4" /> Back to dashboard
          </Button>
        </div>
      </main>
    </div>
  );
}

function BoardGrid({
  room,
  participants,
  picks,
  onClockTeamIdx,
}: {
  room: Room;
  participants: Participant[];
  picks: Pick[];
  onClockTeamIdx: number | null;
}) {
  const pickByCoord = useMemo(() => {
    const map = new Map<string, Pick>();
    for (const p of picks) map.set(`${p.round}-${p.team_idx}`, p);
    return map;
  }, [picks]);
  const teams = Array.from({ length: room.team_count }, (_, i) => i + 1);
  const rounds = Array.from({ length: room.rounds }, (_, i) => i + 1);

  return (
    <Card className="overflow-hidden border-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-10 border-b-2 border-r border-border bg-muted/60 px-2 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                R
              </th>
              {teams.map((t) => {
                const team = participants.find((p) => p.draft_position === t);
                const isOnClock = t === onClockTeamIdx;
                return (
                  <th
                    key={t}
                    className={`min-w-[110px] border-b-2 border-r border-border px-2 py-2 text-left text-[11px] font-black uppercase tracking-widest ${
                      isOnClock ? "bg-primary/15 text-primary" : "bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <div className="truncate">{team?.team_name ?? `Team ${t}`}</div>
                    <div className="text-[9px] opacity-70">#{t}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 border-b border-r border-border bg-muted/40 px-2 py-2 text-center text-[11px] font-black text-muted-foreground">
                  {r}
                </td>
                {teams.map((t) => {
                  const pick = pickByCoord.get(`${r}-${t}`);
                  const isCurrent =
                    !pick &&
                    onClockTeamIdx === t &&
                    Math.floor((room.current_pick_number - 1) / room.team_count) + 1 === r;
                  return (
                    <td
                      key={t}
                      className={`min-w-[110px] border-b border-r border-border px-2 py-1.5 align-top text-xs ${
                        isCurrent ? "bg-primary/15 animate-pulse" : ""
                      }`}
                    >
                      {pick ? (
                        <div>
                          <div className="truncate font-bold leading-tight">{pick.player_name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {pick.player_position} · {pick.player_team}
                          </div>
                        </div>
                      ) : isCurrent ? (
                        <div className="text-center text-[10px] font-black uppercase tracking-widest text-primary">
                          on the clock
                        </div>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PlayerPickPanel({
  players,
  loading,
  search,
  onSearch,
  posFilter,
  onPosFilter,
  onClockTeam,
  canDraftPlayer,
  onDraft,
  busy,
  isHost,
  onUndo,
  picksExist,
  error,
  expanded,
}: {
  players: DraftablePlayer[];
  loading: boolean;
  search: string;
  onSearch: (s: string) => void;
  posFilter: string;
  onPosFilter: (s: string) => void;
  onClockTeam: Participant | null;
  canDraftPlayer: (p: DraftablePlayer) => boolean;
  onDraft: (p: DraftablePlayer) => void;
  busy: boolean;
  isHost: boolean;
  onUndo: () => void;
  picksExist: boolean;
  error: string | null;
  expanded?: boolean;
}) {
  return (
    <Card className={`flex flex-col overflow-hidden border-2 ${expanded ? "" : "lg:sticky lg:top-40 lg:max-h-[calc(100vh-11rem)]"}`}>
      <div className="border-b-2 border-border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search players…"
              className="h-9 pl-7 font-bold"
              autoFocus
            />
          </div>
          {isHost && picksExist && (
            <Button size="sm" variant="ghost" onClick={onUndo} className="h-9 text-xs font-bold">
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </Button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {(["ALL", "PG", "SG", "SF", "PF", "C"] as const).map((p) => (
            <button
              key={p}
              onClick={() => onPosFilter(p)}
              className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest transition ${
                posFilter === p
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
          {error}
        </div>
      )}
      <div className={`overflow-y-auto ${expanded ? "max-h-[60vh]" : ""}`}>
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        ) : players.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No players match.</div>
        ) : (
          <ul className="divide-y divide-border">
            {players.slice(0, 60).map((p) => {
              const eligible = canDraftPlayer(p);
              return (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <PlayerAvatar name={p.name} team={p.team ?? ""} nbaPlayerId={p.nbaPlayerId} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.position} · {p.team}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={!isHost || !eligible || busy || !onClockTeam}
                    onClick={() => onDraft(p)}
                    className="h-8 shrink-0 text-xs font-black"
                    title={
                      !eligible
                        ? `No open slot on ${onClockTeam?.team_name ?? "team"} for a ${p.position}`
                        : undefined
                    }
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Draft"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function TeamRosterQuickView({
  participant,
  picks,
  slotConfig,
}: {
  participant: Participant | null;
  picks: Pick[];
  slotConfig: SlotConfig;
}) {
  if (!participant) return null;
  const assigned = assignPicksToSlots(picks, slotConfig);
  return (
    <Card className="border-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-black uppercase tracking-widest text-primary">
          Current roster · {participant.team_name}
        </div>
        <span className="text-[11px] font-bold text-muted-foreground">
          {picks.length} pick{picks.length === 1 ? "" : "s"}
        </span>
      </div>
      {assigned.length === 0 ? (
        <div className="py-3 text-center text-xs text-muted-foreground">
          No picks yet — this player will be their first.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
          {assigned.map(({ pick, spotKey }) => (
            <li
              key={pick.id}
              className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1"
            >
              <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-black text-primary">
                {spotKey ?? "OV"}
              </span>
              <span className="truncate font-bold">{pick.player_name}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentPicks({
  picks,
  participants,
}: {
  picks: Pick[];
  participants: Participant[];
}) {
  const recent = picks.slice(-6).reverse();
  if (recent.length === 0) return null;
  const teamName = (idx: number) =>
    participants.find((p) => p.draft_position === idx)?.team_name ?? `Team ${idx}`;
  return (
    <Card className="border-2 p-3">
      <div className="mb-2 text-[11px] font-black uppercase tracking-widest text-primary">
        Recent picks
      </div>
      <ul className="space-y-1 text-xs">
        {recent.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="w-10 shrink-0 rounded bg-muted px-1 py-0.5 text-center font-black tabular-nums">
              {p.round}.{p.pick_number}
            </span>
            <span className="truncate font-bold">{p.player_name}</span>
            <span className="ml-auto truncate text-muted-foreground">→ {teamName(p.team_idx)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TeamShareLinks({
  participants,
  onCopy,
  copiedToken,
}: {
  participants: Participant[];
  onCopy: (token: string) => void;
  copiedToken: string | null;
}) {
  return (
    <Card className="border-2 p-3">
      <div className="mb-2 text-[11px] font-black uppercase tracking-widest text-primary">
        Team roster links
      </div>
      <ul className="space-y-1">
        {participants
          .sort((a, b) => (a.draft_position ?? 999) - (b.draft_position ?? 999))
          .map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-xs">
              <span className="w-5 shrink-0 text-center font-black text-muted-foreground">
                {p.draft_position}
              </span>
              <span className="truncate font-bold">{p.team_name}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onCopy(p.share_token)}
                className="ml-auto h-7 text-[10px] font-black"
              >
                {copiedToken === p.share_token ? (
                  <>
                    <Check className="h-3 w-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Copy
                  </>
                )}
              </Button>
            </li>
          ))}
      </ul>
    </Card>
  );
}
