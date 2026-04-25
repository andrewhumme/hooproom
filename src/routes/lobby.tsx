import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { mockSessions, formatRelative, type DraftSession } from "@/lib/mockSessions";
import { Clock, Users, Zap, Trophy, ArrowRight, LogOut, Filter } from "lucide-react";

export const Route = createFileRoute("/lobby")({
  component: LobbyPage,
  head: () => ({
    meta: [
      { title: "Draft Lobby — HoopRoom" },
      {
        name: "description",
        content: "Browse upcoming live NBA mock drafts. Join a public room or quick-match into your format.",
      },
      { property: "og:title", content: "HoopRoom Lobby — Live NBA Mock Drafts" },
      {
        property: "og:description",
        content: "Browse upcoming live NBA mock drafts and join in seconds.",
      },
    ],
  }),
});

const SKILLS = ["All", "Casual", "Competitive", "Sharks"] as const;
const FORMATS = ["All", "9-CAT", "8-CAT", "POINTS", "ROTO"] as const;

function LobbyPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [skill, setSkill] = useState<(typeof SKILLS)[number]>("All");
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("All");

  const sessions = mockSessions.filter(
    (s) => (skill === "All" || s.skill === skill) && (format === "All" || s.scoringFormat === format),
  );

  const handleJoin = (sessionId: string) => {
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/lobby?join=${sessionId}` } });
      return;
    }
    // TODO step 3: navigate into the live draft room
    alert(`Joining session ${sessionId} — draft room coming next.`);
  };

  const handleQuickJoin = () => {
    if (!user) {
      navigate({ to: "/auth", search: { redirect: "/lobby" } });
      return;
    }
    const next = sessions[0];
    if (next) handleJoin(next.id);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-black">
              H
            </div>
            <span className="text-lg font-black tracking-tight">HoopRoom</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-semibold md:flex">
            <Link to="/" className="hover:text-primary">Home</Link>
            <Link to="/lobby" className="text-primary">Lobby</Link>
          </nav>
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
            ) : user ? (
              <>
                <span className="hidden text-sm font-semibold sm:inline">
                  {user.user_metadata?.display_name ?? user.email}
                </span>
                <Button size="sm" variant="outline" onClick={signOut} className="font-bold">
                  <LogOut /> Sign out
                </Button>
              </>
            ) : (
              <Button asChild size="sm" className="font-bold">
                <Link to="/auth" search={{ redirect: "/lobby" }}>Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero strip */}
      <section className="border-b border-border bg-secondary text-secondary-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-10 lg:flex-row lg:items-center">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-primary">Live Lobby</div>
            <h1 className="mt-2 text-4xl font-black md:text-5xl">Pick a room. Tip-off in minutes.</h1>
            <p className="mt-3 max-w-xl text-secondary-foreground/75">
              Browse public NBA mock drafts. Filter by skill and format, or quick-join the next room that fits.
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleQuickJoin}
            className="h-12 px-6 text-base font-bold shadow-[var(--shadow-glow)]"
          >
            <Zap /> Quick Join
            <ArrowRight />
          </Button>
        </div>
      </section>

      {/* Filters + sessions */}
      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
            <Filter className="h-4 w-4" /> Filter
          </div>
          <FilterGroup label="Skill" options={SKILLS} value={skill} onChange={setSkill} />
          <FilterGroup label="Format" options={FORMATS} value={format} onChange={setFormat} />
          <div className="ml-auto text-sm font-semibold text-muted-foreground">
            {sessions.length} {sessions.length === 1 ? "room" : "rooms"} live
          </div>
        </div>

        {sessions.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-lg font-bold">No rooms match those filters.</p>
            <p className="mt-1 text-sm text-muted-foreground">Try widening the skill or format.</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} isAuthed={!!user} onJoin={() => handleJoin(s.id)} />
            ))}
          </div>
        )}

        {!user && !loading && (
          <Card className="mt-10 flex flex-col items-center justify-between gap-4 border-2 border-primary/30 bg-primary/5 p-6 text-center sm:flex-row sm:text-left">
            <div>
              <div className="text-base font-black">Ready to draft?</div>
              <div className="text-sm text-muted-foreground">
                Create a free account to join any room or save your rankings.
              </div>
            </div>
            <Button asChild size="lg" className="font-bold">
              <Link to="/auth" search={{ redirect: "/lobby" }}>
                Sign up free <ArrowRight />
              </Link>
            </Button>
          </Card>
        )}
      </section>
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      <span className="px-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
            value === opt
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function SessionCard({
  session,
  isAuthed,
  onJoin,
}: {
  session: DraftSession;
  isAuthed: boolean;
  onJoin: () => void;
}) {
  const filling = session.joined / session.teams >= 0.75;
  return (
    <Card className="flex flex-col overflow-hidden border-2 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-bold)]">
      <div className="border-b-2 border-border bg-muted/40 p-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="font-bold">{session.scoringFormat}</Badge>
          <SkillPill skill={session.skill} />
        </div>
        <h3 className="mt-3 text-lg font-black leading-tight">{session.name}</h3>
        <div className="mt-1 text-xs font-semibold text-muted-foreground">
          Hosted by @{session.host}
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border text-center">
        <Stat icon={<Users />} label="Teams" value={`${session.joined}/${session.teams}`} highlight={filling} />
        <Stat icon={<Trophy />} label="Rounds" value={String(session.rounds)} />
        <Stat icon={<Clock />} label="Clock" value={`${session.pickClockSec}s`} />
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Starts
          </div>
          <div className="text-sm font-black text-primary">{formatRelative(session.startsAt)}</div>
        </div>
        <Button onClick={onJoin} className="font-bold" size="sm">
          {isAuthed ? "Join" : "Sign in to join"} <ArrowRight />
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

function SkillPill({ skill }: { skill: DraftSession["skill"] }) {
  const styles =
    skill === "Sharks"
      ? "bg-secondary text-secondary-foreground"
      : skill === "Competitive"
        ? "bg-primary/15 text-primary"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-black uppercase tracking-widest ${styles}`}>
      {skill}
    </span>
  );
}
