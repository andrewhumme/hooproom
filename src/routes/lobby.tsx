import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowRight, Lock, Plus, Users, Zap } from "lucide-react";
import { formatDuration } from "@/lib/utils";

export const Route = createFileRoute("/lobby")({
  component: LobbyPage,
  head: () => ({
    meta: [
      { title: "Draft Lobby — HoopRoom" },
      {
        name: "description",
        content: "Browse live NBA snake drafts. Join an open room or spin up your own in seconds.",
      },
      { property: "og:title", content: "HoopRoom Lobby — Live NBA Drafts" },
      {
        property: "og:description",
        content: "Browse live NBA snake drafts and join in seconds.",
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
  visibility: "public" | "spectate" | "private";
  current_pick_number: number | null;
  pick_deadline: string | null;
  created_at: string;
  participant_count?: number;
};

function LobbyPage() {
  const { user, isGuest, loading: authLoading } = useAuth();
  const isReal = !!user && !isGuest;
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    let mounted = true;

    const load = async () => {
      const { data: roomData, error } = await supabase
        .from("draft_rooms")
        .select("*")
        .in("status", ["waiting", "drafting", "paused"])
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Failed to load rooms", error);
        if (mounted) setLoading(false);
        return;
      }

      const ids = (roomData ?? []).map((r) => r.id);
      let counts: Record<string, number> = {};
      if (ids.length) {
        const { data: parts } = await supabase
          .from("draft_participants")
          .select("room_id")
          .in("room_id", ids);
        counts = (parts ?? []).reduce<Record<string, number>>((acc, p) => {
          acc[p.room_id] = (acc[p.room_id] ?? 0) + 1;
          return acc;
        }, {});
      }

      if (mounted) {
        setRooms(
          (roomData ?? []).map((r) => ({ ...r, participant_count: counts[r.id] ?? 0 })) as Room[]
        );
        setLoading(false);
      }
    };

    load();

    const channel = supabase
      .channel("lobby-rooms")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_rooms" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_participants" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "draft_picks" },
        () => load()
      )
      .subscribe();

    // Safety-net poll so the lobby never shows a stale draft, even if a
    // realtime event is dropped or the tab was backgrounded.
    const poll = setInterval(load, 8000);

    return () => {
      mounted = false;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [authLoading]);

  const handleCreate = () => {
    if (!isReal) {
      navigate({ to: "/auth", search: { redirect: "/lobby/new" } });
      return;
    }
    navigate({ to: "/lobby/new" });
  };

  const handleCreateOffline = () => {
    if (!isReal) {
      navigate({ to: "/auth", search: { redirect: "/lobby/new-offline" } });
      return;
    }
    navigate({ to: "/lobby/new-offline" });
  };

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-secondary text-secondary-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-10 lg:flex-row lg:items-center">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-primary">
              Live Lobby
            </div>
            <h1 className="mt-2 text-4xl font-black md:text-5xl">
              Pick a room. Tip-off in minutes.
            </h1>
            <p className="mt-3 max-w-xl text-secondary-foreground/75">
              Browse open snake drafts or host your own — set the format, clock, and team count,
              then invite your league.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              onClick={handleCreate}
              className="h-12 px-6 text-base font-bold shadow-[var(--shadow-glow)]"
            >
              <Plus /> Host a draft
              <ArrowRight />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleCreateOffline}
              className="h-12 px-6 text-base font-bold"
            >
              <Users /> Host in person
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Open rooms</h2>
            <p className="text-sm text-muted-foreground">
              {loading
                ? "Loading…"
                : `${rooms.length} ${rooms.length === 1 ? "room" : "rooms"} live`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-10 text-center">
            <Zap className="h-10 w-10 text-primary" />
            <div>
              <p className="text-lg font-black">No live rooms right now.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Be the first — host a draft and share the link with your league.
              </p>
            </div>
            <Button onClick={handleCreate} size="lg" className="font-bold">
              <Plus /> Host a draft <ArrowRight />
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border-2 border-border shadow-[var(--shadow-bold)]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[28%]">Room</TableHead>
                  <TableHead className="w-[12%]">Format</TableHead>
                  <TableHead className="w-[10%] text-center">Teams</TableHead>
                  <TableHead className="w-[8%] text-center">Rounds</TableHead>
                  <TableHead className="w-[10%] text-center">Clock</TableHead>
                  <TableHead className="w-[14%] text-center">Progress</TableHead>
                  <TableHead className="w-[10%] text-center">Status</TableHead>
                  <TableHead className="w-[8%] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((room) => (
                  <RoomRow key={room.id} room={room} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!isReal && !authLoading && (
          <div className="mt-10 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-center text-sm text-muted-foreground">
            <Lock className="h-4 w-4 text-primary" />
            <span className="font-bold text-foreground">Sign in to host or join a draft.</span>
            Anyone can spectate a live draft via its share link.
          </div>
        )}
      </section>
    </div>
  );
}

function RoomRow({ room }: { room: Room }) {
  const navigate = useNavigate();
  const filling = (room.participant_count ?? 0) / room.team_count >= 0.75;
  const isLive = room.status === "drafting";

  const handleOpen = () => {
    navigate({ to: "/draft/$roomId", params: { roomId: room.id } });
  };

  return (
    <TableRow className="group cursor-pointer transition-colors" onClick={handleOpen}>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="font-bold leading-tight">{room.name}</span>
          {room.visibility === "spectate" && (
            <span className="text-[10px] font-black uppercase tracking-widest text-accent-foreground">
              Spectate Only
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-bold">
          {room.scoring_format}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        <span className={`font-black ${filling ? "text-primary" : ""}`}>
          {room.participant_count ?? 0}/{room.team_count}
        </span>
      </TableCell>
      <TableCell className="text-center font-black">{room.rounds}</TableCell>
      <TableCell className="text-center text-muted-foreground tabular-nums">
        <RoomClock room={room} />
      </TableCell>
      <TableCell className="text-center">
        <RoomProgress room={room} />
      </TableCell>
      <TableCell className="text-center">
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-black uppercase tracking-widest text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Live
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-black uppercase tracking-widest text-muted-foreground">
            Open
          </span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          className="font-bold opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            handleOpen();
          }}
        >
          {room.visibility === "spectate"
            ? "Watch"
            : isLive
              ? "Join"
              : "Open"} <ArrowRight />
        </Button>
      </TableCell>
    </TableRow>
  );
}


function RoomProgress({ room }: { room: Room }) {
  const totalPicks = room.team_count * room.rounds;
  const current = room.current_pick_number ?? 0;
  if (room.status === "waiting") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (room.status === "complete") {
    return <span className="text-xs font-bold text-muted-foreground">Complete</span>;
  }
  const round = totalPicks > 0 ? Math.min(room.rounds, Math.floor((current - 1) / room.team_count) + 1) : 0;
  const pct = totalPicks > 0 ? Math.min(100, (current / totalPicks) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs font-black tabular-nums">
        Pick {current}/{totalPicks}
        <span className="ml-1 font-normal text-muted-foreground">R{round}</span>
      </span>
      <div className="h-1 w-20 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RoomClock({ room }: { room: Room }) {
  const [now, setNow] = useState(() => Date.now());
  const isLive = room.status === "drafting" && !!room.pick_deadline;
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  if (room.status === "waiting") {
    return <span>{formatDuration(room.pick_clock_sec)}</span>;
  }
  if (room.status === "paused") {
    return <span className="text-xs font-bold uppercase tracking-widest">Paused</span>;
  }
  if (room.status === "complete") {
    return <span>—</span>;
  }
  if (!room.pick_deadline) {
    return <span>{formatDuration(room.pick_clock_sec)}</span>;
  }
  const remaining = Math.max(0, Math.ceil((new Date(room.pick_deadline).getTime() - now) / 1000));
  const urgent = remaining <= 10;
  return (
    <span className={`font-black ${urgent ? "text-primary" : "text-foreground"}`}>
      {formatDuration(remaining)}
    </span>
  );
}
