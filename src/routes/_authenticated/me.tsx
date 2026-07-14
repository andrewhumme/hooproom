import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowRight,
  BarChart3,
  Clock,
  Crown,
  Loader2,
  Trophy,
  Users,
} from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/me")({
  component: MyDraftsPage,
  head: () => ({
    meta: [
      { title: "My Drafts — HoopRoom" },
      { name: "description", content: "Your hosted, joined, and completed HoopRoom drafts." },
    ],
  }),
});

type RoomStatus = "waiting" | "drafting" | "paused" | "complete";

type RoomRow = {
  id: string;
  name: string;
  host_user_id: string;
  team_count: number;
  rounds: number;
  pick_clock_sec: number;
  scoring_format: string;
  draft_format: string;
  status: RoomStatus;
  created_at: string;
  completed_at: string | null;
  current_pick_number: number | null;
};

type RoomMeta = {
  totalPicks: number;
  myPicks: number;
  totalSlots: number;
};

type SortKey = "recent" | "oldest";
type SideFilter = "all" | "hosting" | "joined";
type FormatFilter = "all" | "snake" | "auction";

function MyDraftsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user!.id;
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [metaByRoom, setMetaByRoom] = useState<Record<string, RoomMeta>>({});
  const [tab, setTab] = useState<"active" | "completed" | "profile">("active");

  // Filters / sort
  const [sort, setSort] = useState<SortKey>("recent");
  const [side, setSide] = useState<SideFilter>("all");
  const [fmt, setFmt] = useState<FormatFilter>("all");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const hostedQ = supabase.from("draft_rooms").select("*").eq("host_user_id", userId);
      const partsQ = supabase
        .from("draft_participants")
        .select("room_id")
        .eq("user_id", userId);

      const [hostedRes, partsRes] = await Promise.all([hostedQ, partsQ]);
      const partRoomIds = (partsRes.data ?? []).map((r) => r.room_id);

      let joinedRooms: RoomRow[] = [];
      if (partRoomIds.length) {
        const { data } = await supabase.from("draft_rooms").select("*").in("id", partRoomIds);
        joinedRooms = (data ?? []) as RoomRow[];
      }
      const byId = new Map<string, RoomRow>();
      [...((hostedRes.data ?? []) as RoomRow[]), ...joinedRooms].forEach((r) => byId.set(r.id, r));
      const allRooms = Array.from(byId.values());

      // Fetch picks for all these rooms in one shot to compute progress + my picks
      const meta: Record<string, RoomMeta> = {};
      allRooms.forEach((r) => {
        meta[r.id] = { totalPicks: 0, myPicks: 0, totalSlots: r.team_count * r.rounds };
      });
      if (allRooms.length) {
        const { data: picks } = await supabase
          .from("draft_picks")
          .select("room_id, user_id, player_id")
          .in(
            "room_id",
            allRooms.map((r) => r.id),
          )
          .not("player_id", "is", null);
        (picks ?? []).forEach((p) => {
          const m = meta[p.room_id];
          if (!m) return;
          m.totalPicks += 1;
          if (p.user_id === userId) m.myPicks += 1;
        });
      }

      if (mounted) {
        setRooms(allRooms);
        setMetaByRoom(meta);
        setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const hostedIds = useMemo(
    () => new Set(rooms.filter((r) => r.host_user_id === userId).map((r) => r.id)),
    [rooms, userId],
  );

  const filterSort = (list: RoomRow[]) => {
    let out = list;
    if (side === "hosting") out = out.filter((r) => hostedIds.has(r.id));
    else if (side === "joined") out = out.filter((r) => !hostedIds.has(r.id));
    if (fmt !== "all") out = out.filter((r) => (r.draft_format ?? "snake") === fmt);
    out = [...out].sort((a, b) => {
      const da = +new Date(a.created_at);
      const db = +new Date(b.created_at);
      return sort === "recent" ? db - da : da - db;
    });
    return out;
  };

  const active = useMemo(() => filterSort(rooms.filter((r) => r.status !== "complete")), [
    rooms,
    hostedIds,
    side,
    fmt,
    sort,
  ]);
  const completed = useMemo(() => filterSort(rooms.filter((r) => r.status === "complete")), [
    rooms,
    hostedIds,
    side,
    fmt,
    sort,
  ]);

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-secondary text-secondary-foreground">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">
            Your account
          </div>
          <h1 className="mt-2 text-4xl font-black md:text-5xl">My Drafts</h1>
          <p className="mt-3 max-w-xl text-secondary-foreground/75">
            Everything you've hosted or joined — jump back in, check results, or update your
            profile.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="active">
              Active{active.length ? ` · ${active.length}` : ""}
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed{completed.length ? ` · ${completed.length}` : ""}
            </TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          {tab !== "profile" && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ToggleGroup
                type="single"
                value={side}
                onValueChange={(v) => v && setSide(v as SideFilter)}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="all" className="font-bold">
                  All
                </ToggleGroupItem>
                <ToggleGroupItem value="hosting" className="font-bold">
                  <Crown className="h-3.5 w-3.5" /> Hosting
                </ToggleGroupItem>
                <ToggleGroupItem value="joined" className="font-bold">
                  Joined
                </ToggleGroupItem>
              </ToggleGroup>

              <Select value={fmt} onValueChange={(v) => setFmt(v as FormatFilter)}>
                <SelectTrigger className="h-9 w-[140px] font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All formats</SelectItem>
                  <SelectItem value="snake">Snake</SelectItem>
                  <SelectItem value="auction">Auction</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="h-9 w-[160px] font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <TabsContent value="active" className="mt-6">
            <RoomList
              loading={loading}
              rooms={active}
              hostedIds={hostedIds}
              metaByRoom={metaByRoom}
              variant="active"
              empty={
                <EmptyState
                  title="No active drafts match these filters."
                  cta={
                    <div className="flex gap-2">
                      <Button asChild className="font-bold">
                        <Link to="/lobby/new">Host a draft</Link>
                      </Button>
                      <Button asChild variant="outline" className="font-bold">
                        <Link to="/lobby">Browse rooms</Link>
                      </Button>
                    </div>
                  }
                />
              }
              onOpen={(id) => navigate({ to: "/draft/$roomId", params: { roomId: id } })}
            />
          </TabsContent>

          <TabsContent value="completed" className="mt-6">
            <RoomList
              loading={loading}
              rooms={completed}
              hostedIds={hostedIds}
              metaByRoom={metaByRoom}
              variant="completed"
              empty={<EmptyState title="No completed drafts match these filters." />}
              onOpen={(id) => navigate({ to: "/draft/$roomId", params: { roomId: id } })}
              onSummary={(id) =>
                navigate({ to: "/draft/$roomId/summary", params: { roomId: id } })
              }
            />
          </TabsContent>

          <TabsContent value="profile" className="mt-6">
            <ProfileSettings userId={userId} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function EmptyState({ title, cta }: { title: string; cta?: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-4 p-10 text-center">
      <Trophy className="h-8 w-8 text-primary" />
      <p className="text-lg font-black">{title}</p>
      {cta}
    </Card>
  );
}

function RoomList({
  loading,
  rooms,
  hostedIds,
  metaByRoom,
  variant,
  empty,
  onOpen,
  onSummary,
}: {
  loading: boolean;
  rooms: RoomRow[];
  hostedIds: Set<string>;
  metaByRoom: Record<string, RoomMeta>;
  variant: "active" | "completed";
  empty: React.ReactNode;
  onOpen: (id: string) => void;
  onSummary?: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-52 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }
  if (!rooms.length) return <>{empty}</>;
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {rooms.map((r) => {
        const meta = metaByRoom[r.id] ?? { totalPicks: 0, myPicks: 0, totalSlots: r.team_count * r.rounds };
        const round = Math.min(
          r.rounds,
          Math.max(1, Math.ceil((r.current_pick_number ?? Math.max(1, meta.totalPicks + 1)) / Math.max(1, r.team_count))),
        );
        const pct = meta.totalSlots > 0 ? Math.round((meta.totalPicks / meta.totalSlots) * 100) : 0;

        return (
          <Card
            key={r.id}
            className="flex flex-col overflow-hidden border-2 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-bold)]"
          >
            <div className="border-b-2 border-border bg-muted/40 p-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="font-bold">
                    {r.scoring_format}
                  </Badge>
                  <Badge variant="outline" className="font-bold capitalize">
                    {r.draft_format ?? "snake"}
                  </Badge>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <h3 className="mt-3 flex items-center gap-2 text-lg font-black leading-tight">
                {hostedIds.has(r.id) && (
                  <Crown className="h-4 w-4 text-primary" aria-label="You're the commissioner" />
                )}
                {r.name}
              </h3>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border border-b border-border text-center">
              <Stat icon={<Users />} label="Teams" value={String(r.team_count)} />
              <Stat icon={<Trophy />} label="Rounds" value={String(r.rounds)} />
              <Stat icon={<Clock />} label="Clock" value={formatDuration(r.pick_clock_sec)} />
            </div>

            {variant === "active" ? (
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <span>
                    {r.status === "waiting"
                      ? "In lobby"
                      : `Round ${round} of ${r.rounds}`}
                  </span>
                  <span>
                    {meta.totalPicks}/{meta.totalSlots} picks
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {meta.myPicks > 0 && (
                  <div className="mt-2 text-xs font-semibold text-muted-foreground">
                    Your team so far: {meta.myPicks} pick{meta.myPicks === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            ) : (
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <span>Final</span>
                  <span>
                    {meta.totalPicks}/{meta.totalSlots} picks
                  </span>
                </div>
                <div className="mt-2 text-sm font-black">
                  Your team: {meta.myPicks} pick{meta.myPicks === 1 ? "" : "s"}
                </div>
                {r.completed_at && (
                  <div className="text-xs text-muted-foreground">
                    Completed {new Date(r.completed_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 p-4">
              {variant === "completed" && onSummary && (
                <Button
                  onClick={() => onSummary(r.id)}
                  size="sm"
                  variant="outline"
                  className="font-bold"
                >
                  <BarChart3 /> Summary
                </Button>
              )}
              <Button onClick={() => onOpen(r.id)} className="font-bold" size="sm">
                Open <ArrowRight />
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: RoomStatus }) {
  const map: Record<RoomStatus, { label: string; cls: string }> = {
    waiting: { label: "Lobby", cls: "bg-muted text-muted-foreground" },
    drafting: { label: "Live", cls: "bg-primary/15 text-primary" },
    paused: { label: "Paused", cls: "bg-amber-500/15 text-amber-600" },
    complete: { label: "Complete", cls: "bg-emerald-500/15 text-emerald-600" },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-black uppercase tracking-widest ${cls}`}
    >
      {label}
    </span>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="px-3 py-3">
      <div className="flex items-center justify-center gap-1 text-muted-foreground">
        <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-1 text-base font-black">{value}</div>
    </div>
  );
}

function ProfileSettings({ userId }: { userId: string }) {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted) return;
        setDisplayName(
          data?.display_name ?? (user?.user_metadata?.display_name as string) ?? "",
        );
        setAvatarUrl(data?.avatar_url ?? "");
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [userId, user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null, avatar_url: avatarUrl.trim() || null })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile updated");
  };

  return (
    <Card className="max-w-xl p-6">
      <h2 className="text-xl font-black">Profile</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        How other commissioners and drafters see you.
      </p>

      {loading ? (
        <div className="mt-6 h-32 animate-pulse rounded-md bg-muted" />
      ) : (
        <form className="mt-6 space-y-4" onSubmit={save}>
          <div>
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="avatar_url">Avatar URL</Label>
            <Input
              id="avatar_url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled className="mt-1.5" />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={saving} className="font-bold">
              {saving && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
            <Button type="button" variant="outline" onClick={signOut} className="font-bold">
              Sign out
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
