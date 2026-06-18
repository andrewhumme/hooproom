import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Zap,
  Users,
  Brain,
  Trophy,
  Clock,
  MessageSquare,
  Check,
  X,
  ArrowRight,
} from "lucide-react";
import { DraftBoardSchematic } from "@/components/DraftBoardSchematic";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "HoopRoom — Real-time NBA Mock Drafts" },
      {
        name: "description",
        content:
          "Live NBA fantasy mock drafts with real-time picks, smart rankings, and AI draft grades. The modern alternative to legacy mock draft sites.",
      },
      { property: "og:title", content: "HoopRoom — Real-time NBA Mock Drafts" },
      {
        property: "og:description",
        content:
          "Live NBA fantasy mock drafts with real-time picks, smart rankings, and AI draft grades.",
      },
    ],
  }),
});

function Landing() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section id="top" className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border-2 border-secondary bg-secondary/5 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              NBA Season 25-26 · Build Your Draft, Your Way
            </div>
            <h1 className="text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
              The most customizable
              <br />
              <span className="bg-gradient-to-r from-primary to-[oklch(0.78_0.19_55)] bg-clip-text text-transparent">
                draft room in fantasy hoops.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">
              Snake or auction. Live, slow, or offline. You set the rules, the clock,
              the rosters — we handle the board. When you're done, export straight to
              ESPN, Yahoo, Sleeper, or any platform you play on.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 px-6 text-base font-bold shadow-[var(--shadow-glow)]"
              >
                <Link to="/lobby/new">
                  Host a Draft <ArrowRight className="ml-1" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 border-2 px-6 text-base font-bold">
                <Link to="/lobby">Browse Lobby</Link>
              </Button>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm">
              <Stat number="Live or Slow" label="Snake or auction, your call" />
              <div className="h-10 w-px bg-border" />
              <Stat number="450+" label="Active NBA players" />
              <div className="h-10 w-px bg-border" />
              <Stat number="1-Click" label="Export to any platform" />
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/20 to-secondary/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border-2 border-border bg-card p-4 shadow-[var(--shadow-bold)] md:p-6">
              <DraftBoardSchematic className="h-auto w-full text-foreground" />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-y-4 border-secondary bg-secondary text-secondary-foreground">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="mb-12 max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-widest text-primary">
              The Toolkit
            </div>
            <h2 className="mt-2 text-4xl font-black md:text-5xl">
              Built for managers who want control.
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={<Zap />}
              title="Snake & auction"
              copy="Run a classic snake or a full auction with concurrent nominations and per-team quotas. Your call."
            />
            <Feature
              icon={<Trophy />}
              title="Custom everything"
              copy="Roster slots, scoring, pick clocks, budgets, nomination caps. Configure the lobby to match your league."
            />
            <Feature
              icon={<Clock />}
              title="Live or slow"
              copy="Real-time rooms with sub-second picks, or multi-day slow drafts with autopick queues. Draft on your schedule."
            />
            <Feature
              icon={<ArrowRight />}
              title="Export anywhere"
              copy="One-click CSV export. Drop your results into ESPN, Yahoo, Sleeper, Fantrax — wherever your league actually lives."
            />
            <Feature
              icon={<Brain />}
              title="Personal rankings & queues"
              copy="Pre-rank your board. Powers 'best available' suggestions and autopicks when you can't make it."
            />
            <Feature
              icon={<Users />}
              title="Offline draft assist"
              copy="Drafting in person? Use HoopRoom as the war room — track picks, see best available, export when you're done."
            />
          </div>
        </div>
      </section>

      {/* Compare */}
      <section id="compare" className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-12 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">
            The Difference
          </div>
          <h2 className="mt-2 text-4xl font-black md:text-5xl">
            HoopRoom vs. the old guard.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Most mock sites lock you into their format and their platform. HoopRoom is the
            pre-draft toolkit — you customize the room, then take the results wherever you want.
          </p>
        </div>
        <Card className="overflow-hidden border-2 shadow-[var(--shadow-bold)]">
          <div className="grid grid-cols-3 border-b-2 border-border bg-muted">
            <div className="p-5 text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Feature
            </div>
            <div className="border-x-2 border-border bg-primary/10 p-5 text-center text-base font-black text-primary">
              HoopRoom
            </div>
            <div className="p-5 text-center text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Legacy mock sites
            </div>
          </div>
          {[
            ["Snake + auction in one tool", true, false],
            ["Custom rules, clocks & rosters", true, false],
            ["Concurrent auction nominations", true, false],
            ["Slow drafts with autopick queues", true, true],
            ["1-click CSV export to any platform", true, false],
            ["Offline / in-person draft assist", true, false],
          ].map(([label, us, them]) => (
            <div key={label as string} className="grid grid-cols-3 border-b border-border last:border-0">
              <div className="p-5 text-sm font-semibold">{label}</div>
              <div className="flex items-center justify-center border-x-2 border-border bg-primary/5 p-5">
                {us ? <Check className="text-primary" /> : <X className="text-muted-foreground" />}
              </div>
              <div className="flex items-center justify-center p-5">
                {them ? <Check className="text-muted-foreground" /> : <X className="text-muted-foreground/50" />}
              </div>
            </div>
          ))}
        </Card>
      </section>

      {/* Waitlist */}
      <section id="waitlist" className="bg-[var(--gradient-hero)] text-secondary-foreground" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">
            Early Access
          </div>
          <h2 className="mt-3 text-4xl font-black md:text-6xl">
            Get in before tip-off.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-secondary-foreground/80">
            We're seeding the first 500 drafters with founder badges, free premium for
            the season, and direct input on the roadmap.
          </p>
          {submitted ? (
            <div className="mx-auto mt-10 max-w-md rounded-xl border-2 border-primary bg-primary/10 p-6">
              <div className="text-2xl font-black text-primary">You're in. 🏀</div>
              <p className="mt-2 text-sm text-secondary-foreground/80">
                We'll email you the second drafts open. Spread the word.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mx-auto mt-10 flex max-w-md flex-col gap-3 sm:flex-row">
              <Input
                type="email"
                required
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 border-2 border-secondary-foreground/20 bg-background text-foreground"
              />
              <Button type="submit" size="lg" className="h-12 px-6 font-bold shadow-[var(--shadow-glow)]">
                Join waitlist
              </Button>
            </form>
          )}
          <p className="mt-4 text-xs text-secondary-foreground/60">
            No spam. One email when we launch.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-black">
              H
            </div>
            <span className="font-bold text-foreground">HoopRoom</span>
            <span>· Built for hoopheads.</span>
          </div>
          <div>© {new Date().getFullYear()} HoopRoom</div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-black text-foreground">{number}</div>
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  copy,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="group rounded-xl border-2 border-secondary-foreground/10 bg-secondary-foreground/5 p-6 transition hover:border-primary hover:bg-secondary-foreground/10">
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground transition group-hover:scale-110">
        {icon}
      </div>
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-secondary-foreground/75">{copy}</p>
    </div>
  );
}
