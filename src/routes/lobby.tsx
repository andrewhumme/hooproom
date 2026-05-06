import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ensureGuestSession } from "@/lib/guestSession";
import { AppHeader } from "@/components/AppHeader";
import { ArrowRight, Clock, Plus, Trophy, Users, Zap } from "lucide-react";

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
  created_at: string;
  participant_count?: number;
};

function LobbyPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      await ensureGuestSession();
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
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCreate = async () => {
    await ensureGuestSession();
    navigate({ to: "/lobby/new" });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader active="lobby" />

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
          <Button
            size="lg"
            onClick={handleCreate}
            className="h-12 px-6 text-base font-bold shadow-[var(--shadow-glow)]"
          >
            <Plus /> Host a draft
            <ArrowRight />
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <Card className="flex flex-col items-center gap-4 p-10 text-center">
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
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((r) => (
              <RoomCard key={r.id} room={r} />
            ))}
          </div>
        )}

        {!user && !authLoading && (
          <Card className="mt-10 border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-center text-sm text-muted-foreground">
            <span className="font-bold text-foreground">Testing mode:</span> jump into any room — we'll spin up a guest identity for you. No signup needed.
          </Card>
        )}
      </section>
    </div>
  );
}

function RoomCard({ room }: { room: Room }) {
  const navigate = useNavigate();
  const filling = (room.participant_count ?? 0) / room.team_count >= 0.75;
  const isLive = room.status === "drafting";

  const handleOpen = async () => {
    await ensureGuestSession();
    navigate({ to: "/draft/$roomId", params: { roomId: room.id } });
  };

  return (
    <Card className="flex flex-col overflow-hidden border-2 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-bold)]">
      <div className="border-b-2 border-border bg-muted/40 p-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="font-bold">
            {room.scoring_format}
          </Badge>
          {isLive ? (
            <span className="flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-black uppercase tracking-widest text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Live
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-black uppercase tracking-widest text-muted-foreground">
              Open
            </span>
          )}
        </div>
        <h3 className="mt-3 text-lg font-black leading-tight">{room.name}</h3>
      </div>
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border text-center">
        <Stat
          icon={<Users />}
          label="Teams"
          value={`${room.participant_count ?? 0}/${room.team_count}`}
          highlight={filling}
        />
        <Stat icon={<Trophy />} label="Rounds" value={String(room.rounds)} />
        <Stat icon={<Clock />} label="Clock" value={`${room.pick_clock_sec}s`} />
      </div>
      <div className="flex items-center justify-end gap-3 p-4">
        <Button onClick={handleOpen} className="font-bold" size="sm">
          {isLive ? "Watch / Join" : "Open room"} <ArrowRight />
        </Button>
      </div>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="px-3 py-3">
      <div className="flex items-center justify-center gap-1 text-muted-foreground">
        <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className={`mt-1 text-base font-black ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
