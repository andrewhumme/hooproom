import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
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
import { MiniMarkdown } from "@/components/MiniMarkdown";
import { contentReader, contentValue } from "@/lib/siteContent";
import { getSiteContentServer } from "@/lib/siteContent.functions";

export const Route = createFileRoute("/")({
  component: Landing,
  // Copy is editable in Admin Tools → Site content.
  loader: () => getSiteContentServer({ data: { prefix: "home." } }),
  head: ({ loaderData }) => {
    const title = contentValue(loaderData, "home.meta.title");
    const description = contentValue(loaderData, "home.meta.description");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
});

const FEATURE_ICONS = [<Zap />, <Trophy />, <Clock />, <ArrowRight />, <Brain />, <Users />];
// [HoopRoom has it, legacy sites have it] for each comparison row.
const COMPARE_MARKS: Array<[boolean, boolean]> = [
  [true, false],
  [true, false],
  [true, false],
  [true, true],
  [true, false],
  [true, false],
];

function Landing() {
  const c = contentReader(Route.useLoaderData());
  const { user, isGuest } = useAuth();
  const signedIn = !!user && !isGuest;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section id="top" className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border-2 border-secondary bg-secondary/5 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              {c("home.hero.badge")}
            </div>
            <h1 className="text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
              {c("home.hero.title")}
              <br />
              <span className="bg-gradient-to-r from-primary to-[oklch(0.78_0.19_55)] bg-clip-text text-transparent">
                {c("home.hero.titleHighlight")}
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">
              {c("home.hero.subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 px-6 text-base font-bold shadow-[var(--shadow-glow)]"
              >
                <Link to="/lobby/new">
                  {c("home.hero.primaryCta")} <ArrowRight className="ml-1" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 border-2 px-6 text-base font-bold">
                <Link to="/lobby">{c("home.hero.secondaryCta")}</Link>
              </Button>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm">
              <Stat number={c("home.stats.1.number")} label={c("home.stats.1.label")} />
              <div className="h-10 w-px bg-border" />
              <Stat number={c("home.stats.2.number")} label={c("home.stats.2.label")} />
              <div className="h-10 w-px bg-border" />
              <Stat number={c("home.stats.3.number")} label={c("home.stats.3.label")} />
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

      {/* About — explains the app purpose (name + logo + what it does) */}
      <section id="about" className="border-t-2 border-border bg-card">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <div className="flex items-center gap-4">
            <img
              src="/favicon.png"
              alt="HoopRoom logo"
              width={56}
              height={56}
              className="h-14 w-14 rounded-xl"
            />
            <div>
              <h2 className="text-3xl font-black tracking-tight md:text-4xl">{c("home.about.title")}</h2>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                hooproom.app
              </p>
            </div>
          </div>
          <MiniMarkdown
            source={c("home.about.body")}
            className="mt-6 space-y-4 text-lg leading-relaxed text-muted-foreground"
          />
        </div>
      </section>


      <section id="features" className="border-y-4 border-secondary bg-secondary text-secondary-foreground">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="mb-12 max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-widest text-primary">
              {c("home.features.eyebrow")}
            </div>
            <h2 className="mt-2 text-4xl font-black md:text-5xl">{c("home.features.title")}</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURE_ICONS.map((icon, i) => (
              <Feature
                key={i}
                icon={icon}
                title={c(`home.features.${i + 1}.title`)}
                copy={c(`home.features.${i + 1}.copy`)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Compare */}
      <section id="compare" className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-12 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">
            {c("home.compare.eyebrow")}
          </div>
          <h2 className="mt-2 text-4xl font-black md:text-5xl">{c("home.compare.title")}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{c("home.compare.subtitle")}</p>
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
              {c("home.compare.competitor")}
            </div>
          </div>
          {COMPARE_MARKS.map(([us, them], i) => (
            <div key={i} className="grid grid-cols-3 border-b border-border last:border-0">
              <div className="p-5 text-sm font-semibold">{c(`home.compare.${i + 1}`)}</div>
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

      {/* Sign up */}
      <section id="signup" className="bg-[var(--gradient-hero)] text-secondary-foreground" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">
            {c("home.signup.eyebrow")}
          </div>
          <h2 className="mt-3 text-4xl font-black md:text-6xl">{c("home.signup.title")}</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-secondary-foreground/80">
            {c("home.signup.body")}
          </p>
          <div className="mt-10 flex justify-center">
            <Button asChild size="lg" className="h-12 px-8 text-base font-bold shadow-[var(--shadow-glow)]">
              {signedIn ? (
                <Link to="/lobby/new">
                  {c("home.signup.signedInButton")} <ArrowRight className="ml-1" />
                </Link>
              ) : (
                <Link to="/auth" search={{ tab: "signup", redirect: "/lobby" }}>
                  {c("home.signup.button")} <ArrowRight className="ml-1" />
                </Link>
              )}
            </Button>
          </div>
          {!signedIn && (
            <p className="mt-4 text-xs text-secondary-foreground/60">{c("home.signup.footnote")}</p>
          )}
        </div>
      </section>

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
