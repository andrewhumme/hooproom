import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Eye, Loader2, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatDuration } from "@/lib/utils";
import { picksPerTeam, roundPickOrder, snakeTeamForPick, teamForPick } from "@/lib/pickOrder";

// Public, view-only draft page. No account or session required: everything
// comes from get_watch_snapshot(), polled every few seconds.
export const Route = createFileRoute("/watch/$key")({
  component: WatchPage,
  head: () => ({
    meta: [
      { title: "Watch Draft — HoopRoom" },
      { name: "description", content: "Follow a HoopRoom draft live, view-only." },
    ],
  }),
});

const POLL_MS = 3000;

type WatchRoom = {
  id: string;
  name: string;
  status: "waiting" | "drafting" | "paused" | "complete";
  visibility: string;
  draft_format: string;
  draft_mode: string | null;
  team_count: number;
  rounds: number;
  reversal_rounds: number[] | null;
  current_pick_number: number;
  pick_clock_sec: number;
  pick_deadline: string | null;
  warmup_until: string | null;
  scheduled_start_at: string | null;
  auto_start_at: string | null;
};

type WatchParticipant = { draft_position: number | null; team_name: string; is_bot: boolean };

type WatchPick = {
  pick_number: number;
  round: number;
  team_idx: number;
  player_id: string;
  player_name: string;
  player_position: string | null;
  player_team: string | null;
  auction_price: number | null;
  was_keeper: boolean;
  was_autopick: boolean;
};

type Snapshot = {
  server_now: string;
  room: WatchRoom;
  participants: WatchParticipant[];
  picks: WatchPick[];
  assignments: { pick_number: number; team_idx: number }[];
};

function WatchPage() {
  const { key } = Route.useParams();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Server clock minus local clock, so countdowns match the server's deadline.
  const [skewMs, setSkewMs] = useState(0);

  useEffect(() => {
    let mounted = true;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
    if (!isUuid) {
      setNotFound(true);
      return;
    }

    const load = async () => {
      const sentAt = Date.now();
      const { data, error } = await supabase.rpc("get_watch_snapshot", { _key: key });
      if (!mounted) return;
      if (error) {
        console.error("watch snapshot failed", error);
        // Keep showing the last good snapshot; only surface the error if we
        // never loaded one. Polling keeps retrying either way.
        setLoadFailed(true);
        return;
      }
      setLoadFailed(false);
      if (!data) {
        setNotFound(true);
        return;
      }
      const s = data as unknown as Snapshot;
      const localMid = (sentAt + Date.now()) / 2;
      setSkewMs(new Date(s.server_now).getTime() - localMid);
      setSnap(s);
      setNotFound(false);
    };

    load();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted = false;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key]);

  if (notFound) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="text-2xl font-black">Draft not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This watch link is invalid, or the draft is private and the link has changed.
        </p>
        <Link
          to="/lobby"
          className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Browse drafts
        </Link>
      </main>
    );
  }

  if (!snap && loadFailed) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="text-2xl font-black">Couldn't load this draft</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong reaching the draft. We'll keep retrying automatically.
        </p>
      </main>
    );
  }

  if (!snap) {
    return (
      <main className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return <WatchView snap={snap} skewMs={skewMs} />;
}

function WatchView({ snap, skewMs }: { snap: Snapshot; skewMs: number }) {
  const { room, participants, picks } = snap;
  const isAuction = room.draft_format === "auction" || room.draft_format === "auction_slow";
  const totalPicks = room.team_count * room.rounds;
  const isComplete =
    room.status === "complete" || (!isAuction && room.current_pick_number > totalPicks);
  const isLive = room.status === "drafting" && !isComplete;

  const teamsBySeat = useMemo(() => {
    const m = new Map<number, WatchParticipant>();
    for (const p of participants) if (p.draft_position) m.set(p.draft_position, p);
    return m;
  }, [participants]);
  const teamName = (idx: number) => teamsBySeat.get(idx)?.team_name ?? `Team ${idx}`;

  const assignments = useMemo(
    () => new Map(snap.assignments.map((a) => [a.pick_number, a.team_idx])),
    [snap.assignments],
  );

  const onClock = useMemo(() => {
    if (!isLive || isAuction) return null;
    const { round } = snakeTeamForPick(
      room.current_pick_number,
      room.team_count,
      room.reversal_rounds,
    );
    const teamIdx = teamForPick(
      room.current_pick_number,
      room.team_count,
      room.reversal_rounds,
      assignments,
    );
    return { round, teamIdx };
  }, [isLive, isAuction, room, assignments]);

  // This round's pick order, honoring reassigned picks.
  const roundOrder = useMemo(
    () =>
      onClock
        ? roundPickOrder(onClock.round, room.team_count, room.reversal_rounds, assignments)
        : [],
    [onClock, room.team_count, room.reversal_rounds, assignments],
  );

  // Each team's picks in draft order — one column per team, one row per pick.
  const picksByTeam = useMemo(() => {
    const m = new Map<number, WatchPick[]>();
    for (const pk of picks) {
      const list = m.get(pk.team_idx) ?? [];
      list.push(pk);
      m.set(pk.team_idx, list);
    }
    return m;
  }, [picks]);

  const seats = Array.from({ length: room.team_count }, (_, i) => i + 1);
  // Teams that traded for extra picks get extra roster spots — show them all.
  const pickCounts = picksPerTeam(room.rounds, room.team_count, room.reversal_rounds, assignments);
  const boardRows = Math.max(room.rounds, ...pickCounts);
  const recent = [...picks].sort((a, b) => b.pick_number - a.pick_number).slice(0, 8);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <Eye className="h-3 w-3" /> View only
            </span>
            <StatusBadge status={room.status} isComplete={isComplete} />
          </div>
          <h1 className="mt-2 text-2xl font-black md:text-3xl">{room.name}</h1>
          <p className="text-sm text-muted-foreground">
            {room.team_count} teams · {room.rounds} rounds ·{" "}
            {isAuction ? "Auction" : `${formatDuration(room.pick_clock_sec)} clock`}
          </p>

          {room.status === "waiting" && (
            <Card className="mt-4 border-2 p-4 text-sm">
              <div className="font-black">The draft hasn't started yet.</div>
              {room.scheduled_start_at && (
                <div className="mt-1 text-muted-foreground">
                  Scheduled for {new Date(room.scheduled_start_at).toLocaleString()}
                </div>
              )}
              <div className="mt-1 text-muted-foreground">
                {participants.length}/{room.team_count} teams joined. This page updates
                automatically.
              </div>
              {room.visibility === "public" && participants.length < room.team_count && (
                <Link
                  to="/draft/$roomId"
                  params={{ roomId: room.id }}
                  className="mt-3 inline-flex text-sm font-bold text-primary hover:underline"
                >
                  Want a team? Sign in and join →
                </Link>
              )}
            </Card>
          )}

          {onClock && (
            <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 border-2 border-primary/40 bg-primary/5 p-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-primary">
                  On the clock · Round {onClock.round} · Pick {room.current_pick_number}
                </div>
                <div className="text-xl font-black">{teamName(onClock.teamIdx)}</div>
              </div>
              <Countdown
                deadline={room.pick_deadline}
                warmupUntil={room.warmup_until}
                skewMs={skewMs}
              />
            </Card>
          )}

          {roundOrder.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Round {onClock?.round} {onClock && snakeTeamForPick(room.current_pick_number, room.team_count, room.reversal_rounds).reverse ? "← reverse" : "→ forward"}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {/* Fixed seat order; each box shows that team's pick(s) this round. */}
                {seats.map((idx) => {
                  const mine = roundOrder.filter((o) => o.teamIdx === idx);
                  const current = onClock?.teamIdx === idx;
                  const done = mine.length > 0 && mine.every((o) => o.pickNumber < room.current_pick_number);
                  return (
                    <div
                      key={idx}
                      className={`flex w-[110px] shrink-0 flex-col gap-0.5 rounded-md border-2 px-2 py-1.5 ${
                        current
                          ? "border-primary bg-primary text-primary-foreground"
                          : done || mine.length === 0
                            ? "border-border bg-muted/40 opacity-60"
                            : "border-border bg-card"
                      }`}
                    >
                      <div className="text-[10px] font-black opacity-80">
                        {mine.length ? mine.map((o) => o.pickInRound).join(" · ") : "—"}
                        {current ? " · On clock" : ""}
                      </div>
                      <div className="truncate text-xs font-black">{teamName(idx)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {room.status === "paused" && (
            <Card className="mt-4 border-2 p-4 text-sm font-black">
              Draft paused by the commissioner.
            </Card>
          )}

          {isLive && isAuction && (
            <Card className="mt-4 border-2 p-4 text-sm">
              <span className="font-black">Auction in progress.</span>{" "}
              <span className="text-muted-foreground">Won players appear on each team below.</span>
            </Card>
          )}

          {isComplete && (
            <Card className="mt-4 flex items-center gap-3 border-2 p-4">
              <Trophy className="h-6 w-6 text-primary" />
              <div className="font-black">Draft complete</div>
            </Card>
          )}
        </div>
      </div>

      {recent.length > 0 && !isComplete && (
        <div className="border-b border-border">
          <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6">
            <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Last picks
            </span>
            {recent.map((pk) => (
              <span
                key={pk.pick_number}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-bold"
              >
                <span className="font-mono text-muted-foreground">#{pk.pick_number}</span>
                {pk.player_name}
                <span className="text-[10px] uppercase text-muted-foreground">
                  {teamName(pk.team_idx)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="overflow-x-auto">
          <div
            className="grid min-w-max gap-1.5"
            style={{ gridTemplateColumns: `repeat(${room.team_count}, minmax(120px, 1fr))` }}
          >
            {seats.map((idx) => {
              const isOnClock = onClock?.teamIdx === idx;
              return (
                <div
                  key={`h${idx}`}
                  className={`rounded-md border-2 px-2 py-1.5 ${
                    isOnClock
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="truncate text-xs font-black">{teamName(idx)}</div>
                  <div className="text-[10px] font-bold opacity-70">
                    {picksByTeam.get(idx)?.length ?? 0}/{pickCounts[idx - 1] ?? room.rounds}
                  </div>
                </div>
              );
            })}
            {Array.from({ length: boardRows }).flatMap((_, row) =>
              seats.map((idx) => {
                const pk = picksByTeam.get(idx)?.[row];
                return (
                  <div
                    key={`${row}-${idx}`}
                    className={`min-h-[52px] rounded-md border px-2 py-1.5 ${
                      pk ? "border-border bg-card" : "border-dashed border-border/60"
                    }`}
                  >
                    {pk && (
                      <>
                        <div className="truncate text-xs font-black">{pk.player_name}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {pk.player_position ?? "—"}
                          {pk.player_team ? ` · ${pk.player_team}` : ""}
                          {isAuction && pk.auction_price != null ? ` · $${pk.auction_price}` : ""}
                          {pk.was_keeper ? " · K" : ""}
                        </div>
                      </>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status, isComplete }: { status: WatchRoom["status"]; isComplete: boolean }) {
  if (isComplete)
    return (
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        Complete
      </span>
    );
  if (status === "drafting")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> Live
      </span>
    );
  return (
    <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
      {status === "paused" ? "Paused" : "Not started"}
    </span>
  );
}

function Countdown({
  deadline,
  warmupUntil,
  skewMs,
}: {
  deadline: string | null;
  warmupUntil: string | null;
  skewMs: number;
}) {
  const [now, setNow] = useState(() => Date.now() + skewMs);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + skewMs), 250);
    return () => clearInterval(t);
  }, [skewMs]);

  if (warmupUntil && new Date(warmupUntil).getTime() > now) {
    const s = Math.ceil((new Date(warmupUntil).getTime() - now) / 1000);
    return (
      <div className="text-sm font-black text-muted-foreground">
        First pick in {formatDuration(s)}
      </div>
    );
  }
  if (!deadline) return null;
  const s = Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000));
  return <div className="font-mono text-2xl font-black tabular-nums">{formatDuration(s)}</div>;
}
