import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Monitor, Plus, Tablet, Trash2, Users } from "lucide-react";
import { DEFAULT_SLOTS, SLOT_KEYS, totalSlots, type SlotConfig } from "@/lib/rosterSlots";

export const Route = createFileRoute("/lobby_/new-offline")({
  component: NewOfflineRoomPage,
  head: () => ({
    meta: [
      { title: "Host an in-person draft — HoopRoom" },
      {
        name: "description",
        content:
          "Run an NBA draft in one room. Add team names, share read-only roster links, no phones needed.",
      },
    ],
  }),
});

type TeamRow = { name: string; email: string };

function NewOfflineRoomPage() {
  const { user, isGuest, loading: authLoading } = useAuth();
  const isReal = !!user && !isGuest;
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isReal) {
      navigate({ to: "/auth", search: { redirect: "/lobby/new-offline" } });
    }
  }, [authLoading, isReal, navigate]);

  const [name, setName] = useState("");
  const [teams, setTeams] = useState<TeamRow[]>([
    { name: "", email: "" },
    { name: "", email: "" },
    { name: "", email: "" },
    { name: "", email: "" },
  ]);
  const [rounds, setRounds] = useState(13);
  const [format, setFormat] = useState<(typeof FORMAT_OPTIONS)[number]>("9-CAT");
  const [layout, setLayout] = useState<"board" | "console">("board");
  const [timerSec, setTimerSec] = useState(60);
  const [enableTimer, setEnableTimer] = useState(false);
  const [slots] = useState<SlotConfig>(DEFAULT_SLOTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateTeam = (i: number, patch: Partial<TeamRow>) =>
    setTeams((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addTeam = () => {
    if (teams.length >= 20) return;
    setTeams((prev) => [...prev, { name: "", email: "" }]);
  };
  const removeTeam = (i: number) => {
    if (teams.length <= 2) return;
    setTeams((prev) => prev.filter((_, idx) => idx !== i));
  };

  const trimmedTeams = teams.map((t) => ({
    name: t.name.trim(),
    email: t.email.trim(),
  }));
  const validTeams = trimmedTeams.filter((t) => t.name.length > 0);
  const emailIssues = trimmedTeams.some(
    (t) => t.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email)
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Give your draft a name.");
      return;
    }
    if (validTeams.length < 2) {
      setError("Add at least 2 team names.");
      return;
    }
    if (validTeams.length > 20) {
      setError("Maximum 20 teams.");
      return;
    }
    if (emailIssues) {
      setError("One of the email addresses looks invalid.");
      return;
    }
    if (rounds < 1 || rounds > 25) {
      setError("Rounds must be between 1 and 25.");
      return;
    }
    // Duplicate name check
    const lower = validTeams.map((t) => t.name.toLowerCase());
    if (new Set(lower).size !== lower.length) {
      setError("Team names must be unique.");
      return;
    }

    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUser = sessionData.session?.user ?? user;
      if (!currentUser) throw new Error("You must be signed in to host a draft");

      const { data: room, error: roomErr } = await supabase
        .from("draft_rooms")
        .insert({
          name: name.trim(),
          host_user_id: currentUser.id,
          team_count: validTeams.length,
          rounds,
          pick_clock_sec: enableTimer ? timerSec : 60,
          scoring_format: format,
          draft_format: "snake",
          draft_mode: "offline",
          layout_preference: layout,
          visibility: "private",
          room_type: "league",
          slots_pg: slots.PG,
          slots_sg: slots.SG,
          slots_g: slots.G,
          slots_sf: slots.SF,
          slots_pf: slots.PF,
          slots_f: slots.F,
          slots_c: slots.C,
          slots_flx: slots.FLX,
          slots_bn: slots.BN,
        })
        .select()
        .single();
      if (roomErr) throw roomErr;

      // Insert all participants. Host takes the first slot with their user_id;
      // rest are "shadow" participants (user_id null) with generated share tokens.
      const participantRows = validTeams.map((t, idx) => ({
        room_id: room.id,
        user_id: idx === 0 ? currentUser.id : null,
        draft_position: idx + 1,
        team_name: t.name,
      }));
      const { data: inserted, error: partErr } = await supabase
        .from("draft_participants")
        .insert(participantRows)
        .select("id, draft_position");
      if (partErr) throw partErr;

      // Contact emails live in a host-only table so spectators can't read them.
      const contactRows = (inserted ?? [])
        .map((p) => {
          const team = validTeams[(p.draft_position ?? 0) - 1];
          return team?.email
            ? { participant_id: p.id, room_id: room.id, owner_email: team.email }
            : null;
        })
        .filter((r): r is { participant_id: string; room_id: string; owner_email: string } => !!r);
      if (contactRows.length > 0) {
        const { error: contactErr } = await supabase
          .from("draft_participant_contacts")
          .insert(contactRows);
        if (contactErr) throw contactErr;
      }


      navigate({ to: "/draft/$roomId", params: { roomId: room.id } });
    } catch (err) {
      const e = err as { message?: string; details?: string; hint?: string } | null;
      const msg =
        [e?.message, e?.details, e?.hint].filter(Boolean).join(" — ") ||
        "Failed to create room";
      console.error("create offline room failed", err);
      setError(msg);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-6 py-10">
        <Link
          to="/lobby"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to lobby
        </Link>
        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">
            New in-person draft
          </div>
          <h1 className="mt-2 text-3xl font-black md:text-4xl">
            Set up your room.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Everyone drafts around one device. Team owners get a link to watch their
            roster fill in — no accounts needed.
          </p>
        </div>

        <Card className="border-2 p-6 shadow-[var(--shadow-bold)]">
          <form onSubmit={handleCreate} className="space-y-6">
            <div>
              <Label htmlFor="name">Draft name</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kev's Basement — 2026 Draft"
                maxLength={80}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Teams ({validTeams.length})</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Add each team owner's name. Email is optional — attach one and you can
                text/email their read-only roster link after the draft.
              </p>
              <div className="mt-3 space-y-2">
                {teams.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-center text-xs font-black text-muted-foreground">
                      {i + 1}
                    </span>
                    <Input
                      value={t.name}
                      onChange={(e) => updateTeam(i, { name: e.target.value })}
                      placeholder="Team name / owner"
                      maxLength={40}
                      className="flex-1 font-bold"
                    />
                    <Input
                      value={t.email}
                      onChange={(e) => updateTeam(i, { email: e.target.value })}
                      placeholder="Email (optional)"
                      type="email"
                      className="hidden flex-1 sm:block"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeTeam(i)}
                      disabled={teams.length <= 2}
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={addTeam}
                disabled={teams.length >= 20}
                className="mt-3 font-bold"
              >
                <Plus className="h-4 w-4" /> Add team
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                You are team #1 by default — rename it above if you'd like.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="rounds">Rounds</Label>
                <Input
                  id="rounds"
                  type="number"
                  min={1}
                  max={25}
                  value={rounds}
                  onChange={(e) => setRounds(parseInt(e.target.value || "13", 10))}
                  className="mt-1.5 font-bold"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Roster size ({totalSlots(slots)} slots).
                </p>
              </div>
              <div>
                <Label htmlFor="format">Scoring</Label>
                <select
                  id="format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as typeof format)}
                  className="mt-1.5 h-10 w-full rounded-md border-2 border-border bg-background px-3 font-bold"
                >
                  {FORMAT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label>Shared pick timer</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Optional stopwatch shown on the host screen. You start & pause it
                manually — it will not auto-pick.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEnableTimer(false)}
                  className={`rounded-md border-2 px-3 py-1.5 text-xs font-black uppercase tracking-widest transition ${
                    !enableTimer
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  Off — untimed
                </button>
                <button
                  type="button"
                  onClick={() => setEnableTimer(true)}
                  className={`rounded-md border-2 px-3 py-1.5 text-xs font-black uppercase tracking-widest transition ${
                    enableTimer
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  On — visible timer
                </button>
                {enableTimer && (
                  <>
                    {[30, 60, 90, 120].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setTimerSec(sec)}
                        className={`rounded-md border-2 px-2.5 py-1.5 text-xs font-black tabular-nums transition ${
                          timerSec === sec
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>

            <div>
              <Label>Host screen layout</Label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    {
                      v: "board" as const,
                      icon: Monitor,
                      label: "TV / Big screen",
                      hint: "Landscape draft board grid — great for a laptop plugged into a TV.",
                    },
                    {
                      v: "console" as const,
                      icon: Tablet,
                      label: "Tablet console",
                      hint: "Big 'on the clock' banner and one-tap draft — passes around the room.",
                    },
                  ]
                ).map(({ v, icon: Icon, label, hint }) => {
                  const active = layout === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setLayout(v)}
                      className={`flex items-start gap-3 rounded-md border-2 p-3 text-left transition ${
                        active
                          ? "border-primary bg-primary/10 shadow-[var(--shadow-bold)]"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div>
                        <div className="text-sm font-black">{label}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {hint}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                You can switch layouts anytime from inside the draft room.
              </p>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="font-bold"
                onClick={() => navigate({ to: "/lobby" })}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1 font-bold" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                <Users className="h-4 w-4" /> Create offline draft
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
