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
import heroImage from "@/assets/hero-dunk.jpg";

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
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="#top" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-black">
              H
            </div>
            <span className="text-lg font-black tracking-tight">HoopRoom</span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-semibold md:flex">
            <a href="#features" className="hover:text-primary">Features</a>
            <a href="#compare" className="hover:text-primary">Why HoopRoom</a>
            <Link to="/lobby" className="hover:text-primary">Lobby</Link>
            <a href="#waitlist" className="hover:text-primary">Early Access</a>
          </nav>
          <Button asChild size="sm" className="font-bold">
            <Link to="/lobby">Browse Drafts</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border-2 border-secondary bg-secondary/5 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              NBA Season 25-26 · Mock Drafts Live Soon
            </div>
            <h1 className="text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
              Mock drafts,
              <br />
              <span className="bg-gradient-to-r from-primary to-[oklch(0.78_0.19_55)] bg-clip-text text-transparent">
                rebuilt for live.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">
              Real-time picks. Live chat. Smart rankings. AI draft grades. The fantasy
              basketball mock draft platform that doesn't feel like it's from 2008.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 px-6 text-base font-bold shadow-[var(--shadow-glow)]">
                <a href="#waitlist">
                  Claim Your Spot <ArrowRight className="ml-1" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 border-2 px-6 text-base font-bold">
                <a href="#features">See How It Works</a>
              </Button>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm">
              <Stat number="< 50ms" label="Pick latency" />
              <div className="h-10 w-px bg-border" />
              <Stat number="450+" label="NBA players" />
              <div className="h-10 w-px bg-border" />
              <Stat number="12" label="League formats" />
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/30 to-secondary/30 blur-2xl" />
            <img
              src={heroImage}
              alt="Basketball player driving to the rim — HoopRoom live mock drafts"
              width={1600}
              height={1200}
              className="relative rounded-2xl shadow-[var(--shadow-bold)]"
            />
            <div className="absolute -bottom-6 -left-6 hidden rounded-xl border-2 border-secondary bg-card px-4 py-3 shadow-[var(--shadow-bold)] md:block">
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">On the Clock</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black text-primary">00:23</span>
                <span className="text-sm font-semibold">Pick 1.07</span>
              </div>
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
              Everything legacy mock sites forgot.
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={<Zap />}
              title="Real-time picks"
              copy="WebSocket-powered draft rooms. Picks land instantly — no F5, no stale boards."
            />
            <Feature
              icon={<Brain />}
              title="AI draft grade"
              copy="Get a per-pick and per-team grade the second the draft ends. Know what worked."
            />
            <Feature
              icon={<Trophy />}
              title="Personal rankings"
              copy="Drag-and-drop tier builder. Your ranks power 'best available' across every draft."
            />
            <Feature
              icon={<Users />}
              title="Smart lobby"
              copy="Filter by scoring, team count, pick speed, and skill. Quick-join in 10 seconds."
            />
            <Feature
              icon={<MessageSquare />}
              title="Live trash talk"
              copy="Built-in draft chat with reactions. Mock drafting should be fun, not silent."
            />
            <Feature
              icon={<Clock />}
              title="Async drafts"
              copy="Slow drafts with mobile push notifications. Draft from anywhere, on your time."
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
            ["Real-time picks (no refresh)", true, false],
            ["Mobile-first draft room", true, false],
            ["AI draft grade & analysis", true, false],
            ["Personal ranking tiers", true, false],
            ["Live in-draft chat", true, false],
            ["Async + slow draft modes", true, true],
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
