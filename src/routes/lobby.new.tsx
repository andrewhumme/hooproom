import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/lobby/new")({
  component: NewRoomPage,
  head: () => ({
    meta: [
      { title: "Host a draft — HoopRoom" },
      { name: "description", content: "Spin up a live NBA snake draft room and invite your league." },
    ],
  }),
});

const SCHEMA = z.object({
  name: z.string().min(2).max(80),
  team_count: z.number().int().min(4).max(20),
  rounds: z.number().int().min(1).max(30),
  pick_clock_sec: z.number().int().min(15).max(600),
  scoring_format: z.enum(["9-CAT", "8-CAT", "POINTS", "ROTO"]),
});

const TEAM_OPTIONS = [8, 10, 12, 14] as const;
const CLOCK_OPTIONS = [30, 60, 90] as const;
const FORMAT_OPTIONS = ["9-CAT", "8-CAT", "POINTS", "ROTO"] as const;

function NewRoomPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [teamCount, setTeamCount] = useState<number>(12);
  const [rounds, setRounds] = useState<number>(13);
  const [pickClock, setPickClock] = useState<number>(60);
  const [format, setFormat] = useState<(typeof FORMAT_OPTIONS)[number]>("9-CAT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && !user) {
    throw redirect({ to: "/auth", search: { redirect: "/lobby/new" } });
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = SCHEMA.safeParse({
      name: name.trim(),
      team_count: teamCount,
      rounds,
      pick_clock_sec: pickClock,
      scoring_format: format,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    if (!user) return;

    setBusy(true);
    try {
      const { data: room, error: roomErr } = await supabase
        .from("draft_rooms")
        .insert({ ...parsed.data, host_user_id: user.id })
        .select()
        .single();
      if (roomErr) throw roomErr;

      // Auto-join host as first participant
      const { error: joinErr } = await supabase.from("draft_participants").insert({
        room_id: room.id,
        user_id: user.id,
        team_name: (user.user_metadata?.display_name as string) ?? "Host",
      });
      if (joinErr) throw joinErr;

      navigate({ to: "/draft/$roomId", params: { roomId: room.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader active="lobby" />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">
            New room
          </div>
          <h1 className="mt-2 text-3xl font-black md:text-4xl">Host a snake draft.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set your format. We'll generate a shareable link you can send to your league.
          </p>
        </div>

        <Card className="border-2 p-6 shadow-[var(--shadow-bold)]">
          <form onSubmit={handleCreate} className="space-y-6">
            <div>
              <Label htmlFor="name">Room name</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tuesday Night Tip-Off"
                maxLength={80}
                className="mt-1.5"
              />
            </div>

            <ChipGroup
              label="Teams"
              options={TEAM_OPTIONS}
              value={teamCount}
              onChange={setTeamCount}
            />

            <div>
              <Label htmlFor="rounds">Rounds (roster size)</Label>
              <Input
                id="rounds"
                type="number"
                min={1}
                max={30}
                value={rounds}
                onChange={(e) => setRounds(parseInt(e.target.value || "0", 10))}
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Total picks: {teamCount * rounds}
              </p>
            </div>

            <ChipGroup
              label="Pick clock"
              options={CLOCK_OPTIONS}
              value={pickClock}
              onChange={setPickClock}
              renderLabel={(v) => `${v}s`}
            />

            <ChipGroup
              label="Scoring format"
              options={FORMAT_OPTIONS}
              value={format}
              onChange={setFormat}
            />

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
                Create room
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}

function ChipGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  renderLabel,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  renderLabel?: (v: T) => string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-md border-2 px-3 py-1.5 text-sm font-bold transition ${
              value === opt
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {renderLabel ? renderLabel(opt) : String(opt)}
          </button>
        ))}
      </div>
    </div>
  );
}
