import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { DEFAULT_SLOTS, SLOT_KEYS, type SlotConfig, totalSlots } from "@/lib/rosterSlots";
import { formatDuration } from "@/lib/utils";

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
  auction_max_concurrent_nominations: z.number().int().min(1).max(400),
  auction_concurrent_per_team: z.number().int().min(1).max(20),
  auction_nominations_per_team: z.number().int().min(1).max(1000).nullable(),
  slots_pg: z.number().int().min(0).max(10),
  slots_sg: z.number().int().min(0).max(10),
  slots_g: z.number().int().min(0).max(10),
  slots_sf: z.number().int().min(0).max(10),
  slots_pf: z.number().int().min(0).max(10),
  slots_f: z.number().int().min(0).max(10),
  slots_c: z.number().int().min(0).max(10),
  slots_flx: z.number().int().min(0).max(10),
  slots_bn: z.number().int().min(0).max(15),
  reversal_rounds: z.array(z.number().int().min(2).max(29)).max(10),
  auto_start_at: z.string().nullable(),
  scheduled_start_at: z.string().nullable(),
  room_type: z.enum(["mock", "league"]),
  visibility: z.enum(["public", "spectate", "private"]),
});

const TEAM_OPTIONS = [6, 8, 10, 12, 14] as const;
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
  { value: "snake", label: "Snake", available: true, hint: "Sequential picks — live or slow based on pick clock" },
  { value: "auction", label: "Auction", available: true, hint: "Nominations + bidding — live or slow based on bid clock" },
] as const;
// Bid clock at or above this threshold flips an auction into "slow" mode (enables anti-snipe).
const SLOW_AUCTION_THRESHOLD_SEC = 3600;
const AUCTION_BUDGET_PRESETS = [100, 200, 300] as const;
const AUCTION_MIN_BID_PRESETS = [1, 2, 5] as const;
const AUCTION_FAST_CLOCK_OPTIONS = [
  { label: "20s", value: 20 },
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
] as const;
const AUCTION_SLOW_CLOCK_OPTIONS = [
  { label: "1h", value: 3600 },
  { label: "4h", value: 4 * 3600 },
  { label: "8h", value: 8 * 3600 },
  { label: "12h", value: 12 * 3600 },
  { label: "24h", value: 24 * 3600 },
] as const;

// Lobby fill timer — when to auto-fill empty seats with bots and start.
const LOBBY_TIMER_OPTIONS = [
  { label: "Off", value: 0, hint: "No auto-start" },
  { label: "5 min", value: 5 * 60 },
  { label: "10 min", value: 10 * 60 },
  { label: "30 min", value: 30 * 60 },
  { label: "1 hr", value: 60 * 60 },
  { label: "24 hr", value: 24 * 60 * 60 },
] as const;

function formatClock(sec: number): string {
  return formatDuration(sec);
}

function NewRoomPage() {
  const { user, isGuest, loading: authLoading } = useAuth();
  const isReal = !!user && !isGuest;
  const navigate = useNavigate();

  // Gate: only real signed-in users can host a draft.
  useEffect(() => {
    if (!authLoading && !isReal) {
      navigate({ to: "/auth", search: { redirect: "/lobby/new" } });
    }
  }, [authLoading, isReal, navigate]);
  const [name, setName] = useState("");
  const [teamCount, setTeamCount] = useState<number>(12);
  const [pickClock, setPickClock] = useState<number>(60);
  const [customSeconds, setCustomSeconds] = useState<string>("");
  const [customHours, setCustomHours] = useState<string>("");
  const [draftFormat, setDraftFormat] = useState<"snake" | "auction">("snake");
  const [auctionBudget, setAuctionBudget] = useState<number>(200);
  const [auctionMinBid, setAuctionMinBid] = useState<number>(1);
  const [auctionBidClock, setAuctionBidClock] = useState<number>(30);
  const [auctionCustomSeconds, setAuctionCustomSeconds] = useState<string>("");
  const [auctionCustomHours, setAuctionCustomHours] = useState<string>("");
  const [auctionAntisnipe, setAuctionAntisnipe] = useState<number | null>(null);
  const [auctionConcurrentPerTeam, setAuctionConcurrentPerTeam] = useState<number>(1);
  const [auctionNomQuotaEnabled, setAuctionNomQuotaEnabled] = useState<boolean>(false);
  const [auctionNomQuota, setAuctionNomQuota] = useState<number>(15);
  const [format, setFormat] = useState<(typeof FORMAT_OPTIONS)[number]>("9-CAT");
  const [slots, setSlots] = useState<SlotConfig>(DEFAULT_SLOTS);
  const [reversalRounds, setReversalRounds] = useState<number[]>([]);
  const [reversalsEnabled, setReversalsEnabled] = useState<boolean>(false);
  const [lobbyTimerSec, setLobbyTimerSec] = useState<number>(5 * 60);
  const [roomType, setRoomType] = useState<"mock" | "league">("mock");
  const [scheduledStartAt, setScheduledStartAt] = useState<string>(""); // datetime-local value
  const [visibility, setVisibility] = useState<"public" | "spectate" | "private">("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const TOTAL_STEPS = 4;
  const STEP_LABELS = ["Type", "Format", "Basics", "Launch"] as const;

  const canAdvance = (s: number): string | null => {
    if (s === 2) {
      // format step — nothing blocking (defaults set)
      return null;
    }
    if (s === 3) {
      if (!name.trim() || name.trim().length < 2) return "Give your room a name (2+ characters).";
      if (rounds < 1) return "Add at least one roster slot.";
    }
    return null;
  };
  const goNext = () => {
    const err = canAdvance(step);
    if (err) { setError(err); return; }
    setError(null);
    setStep((s) => (Math.min(TOTAL_STEPS, s + 1) as 1 | 2 | 3 | 4));
  };
  const goBack = () => {
    setError(null);
    setStep((s) => (Math.max(1, s - 1) as 1 | 2 | 3 | 4));
  };

  const rounds = totalSlots(slots);
  // Auction goes "slow" automatically when bid clock crosses the threshold
  const isAuction = draftFormat === "auction";
  const isSlowAuction = isAuction && auctionBidClock >= SLOW_AUCTION_THRESHOLD_SEC;
  const storedDraftFormat: "snake" | "auction" | "auction_slow" = isSlowAuction
    ? "auction_slow"
    : draftFormat;

  // Drop any reversal rounds outside the valid range when slots change
  useEffect(() => {
    setReversalRounds((prev) => prev.filter((r) => r >= 2 && r <= rounds - 1));
  }, [rounds]);

  const toggleReversal = (r: number) => {
    setReversalRounds((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r].sort((a, b) => a - b),
    );
  };


  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = SCHEMA.safeParse({
      name: name.trim(),
      team_count: teamCount,
      rounds,
      pick_clock_sec: isAuction ? auctionBidClock : pickClock,
      scoring_format: format,
      draft_format: storedDraftFormat,
      auction_budget: auctionBudget,
      auction_min_bid: auctionMinBid,
      auction_bid_clock_sec: auctionBidClock,
      auction_antisnipe_threshold_sec: isSlowAuction ? auctionAntisnipe : null,
      auction_max_concurrent_nominations: isAuction
        ? auctionConcurrentPerTeam * teamCount
        : 1,
      auction_concurrent_per_team: isAuction ? auctionConcurrentPerTeam : 1,
      auction_nominations_per_team:
        isAuction && auctionNomQuotaEnabled ? auctionNomQuota : null,
      slots_pg: slots.PG,
      slots_sg: slots.SG,
      slots_g: slots.G,
      slots_sf: slots.SF,
      slots_pf: slots.PF,
      slots_f: slots.F,
      slots_c: slots.C,
      slots_flx: slots.FLX,
      slots_bn: slots.BN,
      reversal_rounds: reversalsEnabled ? reversalRounds : [],
      auto_start_at:
        roomType === "mock" && lobbyTimerSec > 0
          ? new Date(Date.now() + lobbyTimerSec * 1000).toISOString()
          : null,
      scheduled_start_at:
        roomType === "league" && scheduledStartAt
          ? new Date(scheduledStartAt).toISOString()
          : null,
      room_type: roomType,
      visibility,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    if (roomType === "league" && !scheduledStartAt) {
      setError("Pick a scheduled start date and time for your league draft.");
      return;
    }
    if (rounds < 1) {
      setError("Add at least one roster slot.");
      return;
    }

    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUser = sessionData.session?.user ?? user;
      if (!currentUser) throw new Error("You must be signed in to host a draft");

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
      const e = err as { message?: string; details?: string; hint?: string; code?: string } | null;
      const msg =
        [e?.message, e?.details, e?.hint, e?.code ? `(${e.code})` : null]
          .filter(Boolean)
          .join(" — ") ||
        (typeof err === "string" ? err : "Failed to create room");
      console.error("create room failed", err);
      setError(msg);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">
            New room · Step {step} of {TOTAL_STEPS}
          </div>
          <h1 className="mt-2 text-3xl font-black md:text-4xl">
            {step === 1 && "What kind of draft?"}
            {step === 2 && "Pick your format."}
            {step === 3 && "Room basics."}
            {step === 4 && "Ready to launch."}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {step === 1 && "Mock drafts run practice reps with bot fill. League drafts wait for your real managers."}
            {step === 2 && "Snake or auction, live or slow — dial in the clock and format-specific rules."}
            {step === 3 && "Name it, pick who can join, set team count and roster."}
            {step === 4 && (roomType === "mock" ? "Choose your lobby timer and create the room." : "Schedule kickoff and create the room.")}
          </p>
          <div className="mt-4 flex items-center gap-2">
            {STEP_LABELS.map((label, i) => {
              const n = (i + 1) as 1 | 2 | 3 | 4;
              const done = step > n;
              const current = step === n;
              return (
                <div key={label} className="flex flex-1 items-center gap-2">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-black ${
                      current
                        ? "border-primary bg-primary text-primary-foreground"
                        : done
                          ? "border-primary bg-primary/20 text-primary"
                          : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {n}
                  </div>
                  <div className={`hidden text-[11px] font-bold uppercase tracking-widest sm:block ${current ? "text-foreground" : "text-muted-foreground"}`}>
                    {label}
                  </div>
                  {n < TOTAL_STEPS && (
                    <div className={`h-0.5 flex-1 rounded ${done ? "bg-primary" : "bg-border"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Card className="border-2 p-6 shadow-[var(--shadow-bold)]">
          <form onSubmit={handleCreate} className="space-y-6">
            {/* STEP 1: Room type */}
            {step === 1 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    v: "mock",
                    label: "Mock Draft",
                    hint: "Practice run. Lobby timer fills empty seats with bots.",
                  },
                  {
                    v: "league",
                    label: "League Draft",
                    hint: "Real league. Pick a start date/time — no bot fill unless you say so.",
                  },
                ] as const
              ).map(({ v, label, hint }) => {
                const active = roomType === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setRoomType(v);
                      // Sensible defaults when flipping type
                      if (v === "league") {
                        setVisibility("private");
                      } else {
                        setVisibility("public");
                      }
                    }}
                    className={`rounded-md border-2 p-4 text-left transition ${
                      active
                        ? "border-primary bg-primary/10 shadow-[var(--shadow-bold)]"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <div className="text-base font-black">{label}</div>
                    <div className="mt-1 text-xs font-medium text-muted-foreground">
                      {hint}
                    </div>
                  </button>
                );
              })}
            </div>
            )}

            {step === 3 && (
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
            )}

            {step === 3 && (
            <div>
              <Label>Privacy</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Control who can find this room and whether non-invited users can grab a seat.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    { v: "public", label: "Public", hint: "Listed in the lobby — anyone signed in can join" },
                    { v: "spectate", label: "Spectate only", hint: "Listed in the lobby — viewers can watch, no joining" },
                    { v: "private", label: "Private", hint: "Hidden — share the link to invite players" },
                  ] as const
                ).map(({ v, label, hint }) => {
                  const active = visibility === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVisibility(v)}
                      className={`rounded-md border-2 p-3 text-left transition ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <div className="text-sm font-black">{label}</div>
                      <div className="mt-1 text-[11px] font-medium text-muted-foreground">
                        {hint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            )}

            {step === 2 && (
            <div>
              <Label>Draft format</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Snake = sequential picks. Auction = nominations + bidding. Both run live or slow based on the clocks you choose below.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DRAFT_FORMATS.map((f) => {
                  const active = draftFormat === f.value;
                  const disabled = !f.available;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        setDraftFormat(f.value);
                        if (f.value === "auction") setAuctionBidClock(30);
                      }}
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
              <Label>Teams</Label>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {TEAM_OPTIONS.map((opt) => (
                  <ClockChip
                    key={opt}
                    label={String(opt)}
                    active={teamCount === opt}
                    onClick={() => setTeamCount(opt)}
                  />
                ))}
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={4}
                    max={20}
                    step={1}
                    placeholder="Custom"
                    value={(TEAM_OPTIONS as readonly number[]).includes(teamCount) ? "" : teamCount}
                    onChange={(e) => {
                      const n = parseInt(e.target.value || "0", 10);
                      if (!isNaN(n) && n >= 4 && n <= 20) setTeamCount(n);
                    }}
                    className="h-9 w-24 font-bold"
                  />
                  <span className="text-xs font-bold text-muted-foreground">teams</span>
                </div>
              </div>
            </div>
            <div>
              <Label>Roster slots</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Players auto-fill the first matching slot. G = any guard, F = any forward, FLX = any position.
              </p>
              <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-9">
                {SLOT_KEYS.map((k) => (
                  <div key={k} className="rounded-md border-2 border-border bg-card p-1.5">
                    <div className="text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">
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
                      className="mt-1 h-9 px-0 text-center font-black [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                {rounds} rounds · {teamCount * rounds} total picks
              </p>
            </div>

            {draftFormat === "snake" && (
              <div>
                <Label>Reversal rounds</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add double-pick reversals — the team picking last keeps the next round's first pick, then the snake continues.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ClockChip
                    label="No"
                    active={!reversalsEnabled}
                    onClick={() => {
                      setReversalsEnabled(false);
                      setReversalRounds([]);
                    }}
                  />
                  <ClockChip
                    label="Yes"
                    active={reversalsEnabled}
                    onClick={() => setReversalsEnabled(true)}
                  />
                </div>
                {reversalsEnabled && (
                  <>
                    {rounds < 3 ? (
                      <p className="mt-2 text-xs italic text-muted-foreground">
                        Add at least 3 roster slots to enable reversals.
                      </p>
                    ) : (
                      <>
                        <p className="mt-3 text-xs text-muted-foreground">
                          Pick from rounds 2–{Math.max(2, rounds - 1)}.
                        </p>
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
                      </>
                    )}
                    {reversalRounds.length > 0 && (
                      <p className="mt-2 text-xs font-semibold text-muted-foreground">
                        {reversalRounds.length} reversal{reversalRounds.length === 1 ? "" : "s"}: {reversalRounds.map((r) => `R${r}`).join(", ")}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}


            {isAuction && (
              <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-4 space-y-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-widest text-primary">
                    Auction settings
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nominations follow snake order, skipping teams with full rosters. Each team must end with $1+ per remaining slot.
                  </p>
                </div>

                <div>
                  <Label>Starting budget</Label>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {AUCTION_BUDGET_PRESETS.map((b) => (
                      <ClockChip
                        key={b}
                        label={`$${b}`}
                        active={auctionBudget === b}
                        onClick={() => setAuctionBudget(b)}
                      />
                    ))}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-muted-foreground">$</span>
                      <Input
                        type="number"
                        min={10}
                        max={100000}
                        step={1}
                        value={auctionBudget}
                        onChange={(e) => {
                          const n = parseInt(e.target.value || "0", 10);
                          if (!isNaN(n)) setAuctionBudget(Math.max(10, Math.min(100000, n)));
                        }}
                        className="h-9 w-24 font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Min bid increment</Label>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {AUCTION_MIN_BID_PRESETS.map((b) => (
                      <ClockChip
                        key={b}
                        label={`$${b}`}
                        active={auctionMinBid === b}
                        onClick={() => setAuctionMinBid(b)}
                      />
                    ))}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-muted-foreground">$</span>
                      <Input
                        type="number"
                        min={1}
                        max={auctionBudget}
                        step={1}
                        value={auctionMinBid}
                        onChange={(e) => {
                          const n = parseInt(e.target.value || "0", 10);
                          if (!isNaN(n)) setAuctionMinBid(Math.max(1, Math.min(auctionBudget, n)));
                        }}
                        className="h-9 w-24 font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Bid clock</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    How long bidding stays open after each new bid. Pick a clock of <strong>1h+</strong> to run a slow async auction (anti-snipe unlocks).
                  </p>
                  <div className="mt-2 space-y-2">
                    <div>
                      <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Live
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {AUCTION_FAST_CLOCK_OPTIONS.map((opt) => (
                          <ClockChip
                            key={opt.value}
                            label={opt.label}
                            active={auctionBidClock === opt.value && auctionCustomSeconds === ""}
                            onClick={() => {
                              setAuctionBidClock(opt.value);
                              setAuctionCustomSeconds("");
                              setAuctionCustomHours("");
                              if (auctionAntisnipe && auctionAntisnipe > opt.value) {
                                setAuctionAntisnipe(opt.value);
                              }
                            }}
                          />
                        ))}
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={10}
                            max={3599}
                            step={1}
                            placeholder="Custom"
                            value={auctionCustomSeconds}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAuctionCustomSeconds(v);
                              setAuctionCustomHours("");
                              const n = parseInt(v, 10);
                              if (!isNaN(n) && n >= 10 && n <= 3599) {
                                setAuctionBidClock(n);
                                if (auctionAntisnipe && auctionAntisnipe > n) {
                                  setAuctionAntisnipe(n);
                                }
                              }
                            }}
                            className="h-9 w-24 font-bold"
                          />
                          <span className="text-xs font-bold text-muted-foreground">sec</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Slow
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {AUCTION_SLOW_CLOCK_OPTIONS.map((opt) => (
                          <ClockChip
                            key={opt.value}
                            label={opt.label}
                            active={auctionBidClock === opt.value && auctionCustomHours === ""}
                            onClick={() => {
                              setAuctionBidClock(opt.value);
                              setAuctionCustomSeconds("");
                              setAuctionCustomHours("");
                              if (auctionAntisnipe && auctionAntisnipe > opt.value) {
                                setAuctionAntisnipe(opt.value);
                              }
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
                            value={auctionCustomHours}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAuctionCustomHours(v);
                              setAuctionCustomSeconds("");
                              const n = parseFloat(v);
                              if (!isNaN(n) && n >= 1 && n <= 72) {
                                const sec = Math.round(n * 3600);
                                setAuctionBidClock(sec);
                                if (auctionAntisnipe && auctionAntisnipe > sec) {
                                  setAuctionAntisnipe(sec);
                                }
                              }
                            }}
                            className="h-9 w-24 font-bold"
                          />
                          <span className="text-xs font-bold text-muted-foreground">hrs</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Selected: {formatClock(auctionBidClock)} per bid
                    </p>
                    <p className="mt-1.5 text-[11px] font-bold uppercase tracking-widest text-primary">
                      {isSlowAuction ? "Slow auction · async bidding" : "Live auction · real-time bidding"}
                    </p>
                  </div>
                </div>

                {isSlowAuction && (
                  <div>
                    <Label>Anti-snipe</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <strong>Off</strong> = every new bid resets the clock to the full {formatClock(auctionBidClock)}. <strong>Threshold</strong> = clock only bumps when less than X is left.
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <ClockChip
                        label="Off (full reset)"
                        active={auctionAntisnipe === null}
                        onClick={() => setAuctionAntisnipe(null)}
                      />
                      {[300, 900, 3600].filter((v) => v <= auctionBidClock).map((v) => (
                        <ClockChip
                          key={v}
                          label={`<${formatClock(v)} left`}
                          active={auctionAntisnipe === v}
                          onClick={() => setAuctionAntisnipe(v)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label>Concurrent nominations per team</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    How many players each team can have on the block at once. As soon as one of their nominations is awarded, they get another turn — until they hit this cap. With {teamCount} teams, up to <span className="font-semibold text-foreground">{auctionConcurrentPerTeam * teamCount}</span> players can be on the block at the same time.
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {[1, 2, 3, 5].map((n) => (
                      <ClockChip
                        key={n}
                        label={`${n}`}
                        active={auctionConcurrentPerTeam === n}
                        onClick={() => setAuctionConcurrentPerTeam(n)}
                      />
                    ))}
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      step={1}
                      value={auctionConcurrentPerTeam}
                      onChange={(e) => {
                        const n = parseInt(e.target.value || "1", 10);
                        if (!isNaN(n))
                          setAuctionConcurrentPerTeam(Math.max(1, Math.min(20, n)));
                      }}
                      className="h-9 w-20 font-bold"
                    />
                  </div>
                </div>


                <div>
                  <Label>Nominations per team</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cap how many times each team can nominate over the whole draft. Once they hit the cap, the snake skips them. Must be at least roster size ({rounds}).
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <ClockChip
                      label="Unlimited"
                      active={!auctionNomQuotaEnabled}
                      onClick={() => setAuctionNomQuotaEnabled(false)}
                    />
                    <ClockChip
                      label="Set a cap"
                      active={auctionNomQuotaEnabled}
                      onClick={() => {
                        setAuctionNomQuotaEnabled(true);
                        if (auctionNomQuota < rounds) setAuctionNomQuota(rounds);
                      }}
                    />
                    {auctionNomQuotaEnabled && (
                      <Input
                        type="number"
                        min={rounds}
                        max={1000}
                        step={1}
                        value={auctionNomQuota}
                        onChange={(e) => {
                          const n = parseInt(e.target.value || "0", 10);
                          if (!isNaN(n)) setAuctionNomQuota(Math.max(rounds, Math.min(1000, n)));
                        }}
                        className="h-9 w-24 font-bold"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {!isAuction && (
              <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-4 space-y-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-widest text-primary">
                    Snake settings
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Short clocks for live drafts, long clocks for slow drafts (up to 72h).
                  </p>
                </div>

                <div>
                  <Label>Pick clock</Label>
                  <div className="mt-2 space-y-2">
                    <div>
                      <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Live
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {FAST_CLOCK_OPTIONS.map((opt) => (
                          <ClockChip
                            key={opt.value}
                            label={opt.label}
                            active={pickClock === opt.value && customSeconds === ""}
                            onClick={() => {
                              setPickClock(opt.value);
                              setCustomSeconds("");
                              setCustomHours("");
                            }}
                          />
                        ))}
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={15}
                            max={3599}
                            step={1}
                            placeholder="Custom"
                            value={customSeconds}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCustomSeconds(v);
                              setCustomHours("");
                              const n = parseInt(v, 10);
                              if (!isNaN(n) && n >= 15 && n <= 3599) {
                                setPickClock(n);
                              }
                            }}
                            className="h-9 w-24 font-bold"
                          />
                          <span className="text-xs font-bold text-muted-foreground">sec</span>
                        </div>
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
                              setCustomSeconds("");
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
                              setCustomSeconds("");
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
                    {pickClock >= 3600 && (
                      <p className="text-xs text-muted-foreground">
                        Slow drafts run async — when a clock expires, we'll autopick from the on-the-clock manager's <strong>queue</strong> (set inside the draft room) or fall back to the top available player.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <ChipGroup
              label="Scoring format"
              options={FORMAT_OPTIONS}
              value={format}
              onChange={setFormat}
            />

            {roomType === "mock" ? (
              <div>
                <Label>Lobby auto-start</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  How long to wait for humans to join. When the timer expires, any open seats fill with bots and the draft starts automatically. Once every seat is filled, the timer squeezes to a 10-second countdown.
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {LOBBY_TIMER_OPTIONS.map((opt) => (
                    <ClockChip
                      key={opt.value}
                      label={opt.label}
                      active={lobbyTimerSec === opt.value}
                      onClick={() => setLobbyTimerSec(opt.value)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <Label htmlFor="scheduled_start_at">Scheduled start</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick the date and time your league draft kicks off. The room stays open with no auto-fill — you'll click "Start draft" when everyone's in.
                </p>
                <Input
                  id="scheduled_start_at"
                  type="datetime-local"
                  required
                  value={scheduledStartAt}
                  onChange={(e) => setScheduledStartAt(e.target.value)}
                  className="mt-1.5 w-full font-bold sm:w-auto"
                />
              </div>
            )}


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
