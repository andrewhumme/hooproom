import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ensureGuestSession } from "@/lib/guestSession";
import { AppHeader } from "@/components/AppHeader";
import { Loader2 } from "lucide-react";
import { DEFAULT_SLOTS, SLOT_KEYS, type SlotConfig, totalSlots } from "@/lib/rosterSlots";

export const Route = createFileRoute("/lobby_/new")({
  component: NewRoomPage,
  head: () => ({
    meta: [
      { title: "Host a draft — HoopRoom" },
      { name: "description", content: "Spin up a live NBA snake draft room and invite your league." },
    ],
  }),
});

const MAX_CLOCK_SEC = 72 * 60 * 60; // 72 hours

const SCHEMA = z.object({
  name: z.string().min(2).max(80),
  team_count: z.number().int().min(4).max(20),
  rounds: z.number().int().min(1).max(30),
  pick_clock_sec: z.number().int().min(15).max(MAX_CLOCK_SEC),
  scoring_format: z.enum(["9-CAT", "8-CAT", "POINTS", "ROTO"]),
  draft_format: z.enum(["snake", "auction", "auction_slow"]),
  auction_budget: z.number().int().min(10).max(100000),
  auction_min_bid: z.number().int().min(1).max(100000),
  auction_bid_clock_sec: z.number().int().min(10).max(72 * 60 * 60),
  auction_antisnipe_threshold_sec: z.number().int().min(10).max(72 * 60 * 60).nullable(),
  slots_pg: z.number().int().min(0).max(10),
  slots_sg: z.number().int().min(0).max(10),
  slots_sf: z.number().int().min(0).max(10),
  slots_pf: z.number().int().min(0).max(10),
  slots_c: z.number().int().min(0).max(10),
  slots_flx: z.number().int().min(0).max(10),
  slots_bn: z.number().int().min(0).max(15),
  reversal_rounds: z.array(z.number().int().min(2).max(29)).max(10),
});

const TEAM_OPTIONS = [8, 10, 12, 14] as const;
// Live presets (seconds) + slow presets (hours, stored as seconds)
const FAST_CLOCK_OPTIONS = [
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
  { label: "90s", value: 90 },
] as const;
const SLOW_CLOCK_OPTIONS = [
  { label: "4h", value: 4 * 3600 },
  { label: "8h", value: 8 * 3600 },
  { label: "12h", value: 12 * 3600 },
  { label: "24h", value: 24 * 3600 },
] as const;
const FORMAT_OPTIONS = ["9-CAT", "8-CAT", "POINTS", "ROTO"] as const;
const DRAFT_FORMATS = [
  { value: "snake", label: "Snake", available: true, hint: "Live, real-time picks" },
  { value: "auction", label: "Auction", available: false, hint: "Coming soon — bidding & budgets" },
] as const;

function formatClock(sec: number): string {
  if (sec < 3600) return `${sec}s`;
  const hrs = sec / 3600;
  return Number.isInteger(hrs) ? `${hrs}h` : `${hrs.toFixed(1)}h`;
}

function NewRoomPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [teamCount, setTeamCount] = useState<number>(12);
  const [pickClock, setPickClock] = useState<number>(60);
  const [customHours, setCustomHours] = useState<string>("");
  const [draftFormat, setDraftFormat] = useState<"snake" | "auction">("snake");
  const [format, setFormat] = useState<(typeof FORMAT_OPTIONS)[number]>("9-CAT");
  const [slots, setSlots] = useState<SlotConfig>(DEFAULT_SLOTS);
  const [reversalRounds, setReversalRounds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rounds = totalSlots(slots);

  // Drop any reversal rounds outside the valid range when slots change
  useEffect(() => {
    setReversalRounds((prev) => prev.filter((r) => r >= 2 && r <= rounds - 1));
  }, [rounds]);

  const toggleReversal = (r: number) => {
    setReversalRounds((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r].sort((a, b) => a - b),
    );
  };

  // Make sure a guest session exists as soon as the form mounts so the host
  // can submit immediately. (Testing mode — replace with real auth later.)
  useEffect(() => {
    ensureGuestSession().catch((e) => console.error("guest session failed", e));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = SCHEMA.safeParse({
      name: name.trim(),
      team_count: teamCount,
      rounds,
      pick_clock_sec: pickClock,
      scoring_format: format,
      draft_format: draftFormat,
      slots_pg: slots.PG,
      slots_sg: slots.SG,
      slots_sf: slots.SF,
      slots_pf: slots.PF,
      slots_c: slots.C,
      slots_flx: slots.FLX,
      slots_bn: slots.BN,
      reversal_rounds: reversalRounds,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    if (rounds < 1) {
      setError("Add at least one roster slot.");
      return;
    }

    setBusy(true);
    try {
      await ensureGuestSession();
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUser = sessionData.session?.user ?? user;
      if (!currentUser) throw new Error("Could not start guest session");

      const { data: room, error: roomErr } = await supabase
        .from("draft_rooms")
        .insert({ ...parsed.data, host_user_id: currentUser.id })
        .select()
        .single();
      if (roomErr) throw roomErr;

      // Auto-join host as first participant
      const { error: joinErr } = await supabase.from("draft_participants").insert({
        room_id: room.id,
        user_id: currentUser.id,
        team_name: (currentUser.user_metadata?.display_name as string) ?? "Host",
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
              <Label>Roster slots</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Players auto-fill the first matching slot. FLX accepts any position.
              </p>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {SLOT_KEYS.map((k) => (
                  <div key={k} className="rounded-md border-2 border-border bg-card p-2">
                    <div className="text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {k}
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={k === "BN" ? 15 : 10}
                      value={slots[k]}
                      onChange={(e) => {
                        const cap = k === "BN" ? 15 : 10;
                        setSlots((s) => ({
                          ...s,
                          [k]: Math.max(0, Math.min(cap, parseInt(e.target.value || "0", 10))),
                        }));
                      }}
                      className="mt-1 h-9 text-center font-black"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                {rounds} rounds · {teamCount * rounds} total picks
              </p>
            </div>

            <div>
              <Label>Reversal rounds</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Selected rounds become double-pick reversals — the team picking last keeps the next round's first pick, then the snake continues. Pick from rounds 2–{Math.max(2, rounds - 1)}.
              </p>
              {rounds < 3 ? (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  Add at least 3 roster slots to enable reversals.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Array.from({ length: rounds - 2 }, (_, i) => i + 2).map((r) => {
                    const active = reversalRounds.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleReversal(r)}
                        className={`rounded-md border-2 px-3 py-1.5 text-sm font-bold transition ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        R{r}
                      </button>
                    );
                  })}
                </div>
              )}
              {reversalRounds.length > 0 && (
                <p className="mt-2 text-xs font-semibold text-muted-foreground">
                  {reversalRounds.length} reversal{reversalRounds.length === 1 ? "" : "s"}: {reversalRounds.map((r) => `R${r}`).join(", ")}
                </p>
              )}
            </div>

            <div>
              <Label>Draft format</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Snake is live and real-time. Auction is on the way.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {DRAFT_FORMATS.map((f) => {
                  const active = draftFormat === f.value;
                  const disabled = !f.available;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => !disabled && setDraftFormat(f.value)}
                      className={`relative rounded-md border-2 p-3 text-left transition ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-primary/40"
                      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-black">{f.label}</div>
                        {!f.available && (
                          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                            Soon
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-muted-foreground">
                        {f.hint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Pick clock</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Short clocks for live drafts, long clocks for slow drafts (up to 72h).
              </p>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Live
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {FAST_CLOCK_OPTIONS.map((opt) => (
                      <ClockChip
                        key={opt.value}
                        label={opt.label}
                        active={pickClock === opt.value}
                        onClick={() => {
                          setPickClock(opt.value);
                          setCustomHours("");
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Slow
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {SLOW_CLOCK_OPTIONS.map((opt) => (
                      <ClockChip
                        key={opt.value}
                        label={opt.label}
                        active={pickClock === opt.value && customHours === ""}
                        onClick={() => {
                          setPickClock(opt.value);
                          setCustomHours("");
                        }}
                      />
                    ))}
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={72}
                        step={1}
                        placeholder="Custom"
                        value={customHours}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCustomHours(v);
                          const n = parseFloat(v);
                          if (!isNaN(n) && n >= 1 && n <= 72) {
                            setPickClock(Math.round(n * 3600));
                          }
                        }}
                        className="h-9 w-24 font-bold"
                      />
                      <span className="text-xs font-bold text-muted-foreground">hrs</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs font-semibold text-muted-foreground">
                  Selected: {formatClock(pickClock)} per pick
                </p>
              </div>
            </div>

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

function ClockChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border-2 px-3 py-1.5 text-sm font-bold transition ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
