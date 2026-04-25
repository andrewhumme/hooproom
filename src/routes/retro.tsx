import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import heroImage from "@/assets/hero-retro.jpg";

export const Route = createFileRoute("/retro")({
  component: RetroLanding,
  head: () => ({
    meta: [
      { title: "HoopRoom — Retro Broadcast Concept" },
      {
        name: "description",
        content:
          "90s SportsCenter inspired concept for HoopRoom — bold, nostalgic, broadcast energy.",
      },
    ],
  }),
});

// Retro palette — applied inline so it doesn't fight the global theme
const C = {
  bg: "#0a0a0f",
  ink: "#0a0a0f",
  paper: "#f4ead5",
  magenta: "#ff2e88",
  yellow: "#ffd400",
  cyan: "#00e1ff",
  orange: "#ff6a00",
};

function RetroLanding() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <div
      style={{
        background: C.bg,
        color: C.paper,
        fontFamily: "'Archivo Black', 'Impact', system-ui, sans-serif",
      }}
      className="min-h-screen overflow-hidden"
    >
      {/* CRT scanline overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.08]"
        style={{
          background:
            "repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)",
        }}
      />

      {/* Top broadcast bar */}
      <div
        className="flex items-center justify-between px-4 py-2 text-xs font-black uppercase tracking-[0.25em]"
        style={{ background: C.magenta, color: C.ink }}
      >
        <span>● Live · NBA Mock Drafts</span>
        <span className="hidden md:inline">EST. 1996 ENERGY</span>
        <span>{new Date().toLocaleDateString()}</span>
      </div>

      {/* Nav */}
      <header
        className="border-b-4"
        style={{ borderColor: C.yellow, background: C.ink }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 -rotate-3 items-center justify-center text-2xl font-black italic"
              style={{ background: C.yellow, color: C.ink }}
            >
              H!
            </div>
            <span
              className="text-2xl font-black italic tracking-tight"
              style={{ color: C.paper }}
            >
              HOOP<span style={{ color: C.magenta }}>ROOM</span>
            </span>
          </div>
          <nav className="hidden gap-6 text-xs font-black uppercase tracking-widest md:flex">
            <a href="#features" style={{ color: C.cyan }}>The Plays</a>
            <a href="#compare" style={{ color: C.yellow }}>Vs. Old School</a>
            <a href="#waitlist" style={{ color: C.magenta }}>Tip-Off</a>
          </nav>
          <Link
            to="/"
            className="text-xs font-black uppercase tracking-widest underline-offset-4 hover:underline"
            style={{ color: C.paper }}
          >
            ← Modern version
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        {/* Memphis confetti */}
        <Squiggles />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-16 lg:grid-cols-2">
          <div className="relative z-10">
            <div
              className="mb-6 inline-block -rotate-2 px-3 py-1 text-xs font-black uppercase tracking-[0.3em]"
              style={{ background: C.cyan, color: C.ink }}
            >
              ★ Slammin' Edition · 25-26
            </div>
            <h1
              className="text-6xl font-black italic leading-[0.85] md:text-8xl"
              style={{
                color: C.paper,
                textShadow: `4px 4px 0 ${C.magenta}, 8px 8px 0 ${C.cyan}`,
              }}
            >
              MOCK
              <br />
              <span style={{ color: C.yellow }}>DRAFTS</span>
              <br />
              <span style={{ color: C.magenta }}>GO LIVE.</span>
            </h1>
            <p
              className="mt-6 max-w-md text-lg font-bold"
              style={{ color: C.paper, fontFamily: "'Courier New', monospace" }}
            >
              &gt; REAL_TIME.PICKS{" "}
              <span style={{ color: C.cyan }}>// SMART.RANKINGS</span>
              <br />
              &gt; AI.GRADES{" "}
              <span style={{ color: C.yellow }}>// LIVE.TRASH_TALK</span>
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#waitlist"
                className="inline-block -rotate-1 px-6 py-3 text-base font-black italic uppercase tracking-widest transition hover:rotate-0"
                style={{
                  background: C.yellow,
                  color: C.ink,
                  boxShadow: `6px 6px 0 ${C.magenta}`,
                }}
              >
                ▶ Get Early Access
              </a>
              <a
                href="#features"
                className="inline-block rotate-1 border-4 px-6 py-3 text-base font-black italic uppercase tracking-widest transition hover:rotate-0"
                style={{
                  borderColor: C.cyan,
                  color: C.cyan,
                  background: "transparent",
                }}
              >
                See The Tape
              </a>
            </div>
          </div>

          <div className="relative">
            <div
              className="absolute -inset-3 rotate-2"
              style={{ background: C.magenta }}
            />
            <div
              className="absolute -inset-3 -rotate-1"
              style={{ background: C.yellow, transform: "translate(12px, 12px) rotate(-2deg)" }}
            />
            <img
              src={heroImage}
              alt="Retro 90s broadcast basketball graphic"
              width={1280}
              height={960}
              className="relative block w-full"
              style={{ border: `4px solid ${C.ink}` }}
            />
            {/* Score bug */}
            <div
              className="absolute -bottom-4 left-4 flex items-center gap-3 px-4 py-2 text-xs font-black uppercase tracking-widest"
              style={{ background: C.ink, color: C.paper, border: `3px solid ${C.yellow}` }}
            >
              <span style={{ color: C.magenta }}>● ON THE CLOCK</span>
              <span style={{ color: C.yellow }}>00:23</span>
              <span>PICK 1.07</span>
            </div>
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div
        className="overflow-hidden border-y-4 py-3"
        style={{ background: C.yellow, color: C.ink, borderColor: C.ink }}
      >
        <div className="flex animate-[ticker_30s_linear_infinite] gap-12 whitespace-nowrap text-sm font-black italic uppercase tracking-widest">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="flex gap-12">
              ★ Real-time picks ★ AI draft grades ★ Personal tiers ★ Live chat ★
              Async drafts ★ Mobile first ★ NBA ready ★
            </span>
          ))}
        </div>
        <style>{`@keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
      </div>

      {/* Features */}
      <section id="features" className="relative px-6 py-20" style={{ background: C.ink }}>
        <div className="mx-auto max-w-7xl">
          <div className="mb-12">
            <div
              className="inline-block -rotate-1 px-3 py-1 text-xs font-black uppercase tracking-[0.3em]"
              style={{ background: C.magenta, color: C.ink }}
            >
              The Playbook
            </div>
            <h2
              className="mt-4 text-5xl font-black italic md:text-6xl"
              style={{ color: C.paper, textShadow: `4px 4px 0 ${C.cyan}` }}
            >
              POWER MOVES,
              <br />
              <span style={{ color: C.yellow }}>NO BENCH WARMERS.</span>
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { n: "01", t: "REAL-TIME PICKS", c: "WebSocket draft rooms. Picks land instantly. Zero refresh.", color: C.magenta },
              { n: "02", t: "AI DRAFT GRADE", c: "Per-pick and per-team grades the moment the draft ends.", color: C.cyan },
              { n: "03", t: "RANKING TIERS", c: "Drag-and-drop tier builder. Power your best-available board.", color: C.yellow },
              { n: "04", t: "SMART LOBBY", c: "Filter by scoring, count, pick speed. Quick-join in 10 seconds.", color: C.cyan },
              { n: "05", t: "LIVE TRASH TALK", c: "In-draft chat with reactions. Mocks should be loud.", color: C.magenta },
              { n: "06", t: "ASYNC DRAFTS", c: "Slow drafts with mobile push. Draft from anywhere, anytime.", color: C.yellow },
            ].map((f) => (
              <div
                key={f.n}
                className="relative p-6 transition hover:-translate-y-1"
                style={{
                  background: C.paper,
                  color: C.ink,
                  border: `4px solid ${C.ink}`,
                  boxShadow: `8px 8px 0 ${f.color}`,
                }}
              >
                <div
                  className="mb-3 inline-block px-2 py-0.5 text-xs font-black"
                  style={{ background: f.color, color: C.ink }}
                >
                  #{f.n}
                </div>
                <h3 className="text-2xl font-black italic">{f.t}</h3>
                <p className="mt-2 text-sm font-semibold leading-relaxed">{f.c}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compare */}
      <section
        id="compare"
        className="px-6 py-20"
        style={{ background: C.cyan, color: C.ink }}
      >
        <div className="mx-auto max-w-5xl">
          <h2
            className="mb-10 text-center text-5xl font-black italic md:text-6xl"
            style={{ textShadow: `4px 4px 0 ${C.magenta}` }}
          >
            HOOPROOM <span style={{ color: C.paper }}>VS.</span> THE OLD SCHOOL
          </h2>
          <div
            className="grid grid-cols-3 text-sm font-black uppercase tracking-widest"
            style={{ border: `4px solid ${C.ink}`, background: C.paper }}
          >
            <div className="p-4" style={{ background: C.ink, color: C.paper }}>
              FEATURE
            </div>
            <div
              className="p-4 text-center"
              style={{ background: C.yellow, color: C.ink }}
            >
              ★ HOOPROOM
            </div>
            <div
              className="p-4 text-center"
              style={{ background: C.magenta, color: C.ink }}
            >
              LEGACY
            </div>
            {[
              ["Real-time picks", "✓", "✗"],
              ["Mobile-first room", "✓", "✗"],
              ["AI draft grade", "✓", "✗"],
              ["Ranking tiers", "✓", "✗"],
              ["Live chat", "✓", "✗"],
              ["Async drafts", "✓", "✓"],
            ].map(([l, a, b], i) => (
              <div key={l} className="contents">
                <div
                  className="p-4 font-black"
                  style={{
                    background: i % 2 ? C.paper : "#ece2cb",
                    borderTop: `2px solid ${C.ink}`,
                  }}
                >
                  {l}
                </div>
                <div
                  className="p-4 text-center text-xl"
                  style={{
                    background: i % 2 ? "#fff5b8" : "#ffeb7a",
                    borderTop: `2px solid ${C.ink}`,
                    color: a === "✓" ? "#1a8f3c" : C.ink,
                  }}
                >
                  {a}
                </div>
                <div
                  className="p-4 text-center text-xl"
                  style={{
                    background: i % 2 ? "#ffb3d1" : "#ff8fbe",
                    borderTop: `2px solid ${C.ink}`,
                    color: b === "✗" ? "#8b1a1a" : C.ink,
                  }}
                >
                  {b}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist */}
      <section
        id="waitlist"
        className="relative px-6 py-24"
        style={{ background: C.magenta, color: C.ink }}
      >
        <Squiggles small />
        <div className="relative mx-auto max-w-3xl text-center">
          <div
            className="inline-block rotate-2 px-3 py-1 text-xs font-black uppercase tracking-[0.3em]"
            style={{ background: C.ink, color: C.yellow }}
          >
            ★ Tip-Off Roster ★
          </div>
          <h2
            className="mt-4 text-5xl font-black italic md:text-7xl"
            style={{ color: C.paper, textShadow: `5px 5px 0 ${C.ink}` }}
          >
            GET IN THE GAME.
          </h2>
          <p
            className="mx-auto mt-6 max-w-xl text-base font-bold uppercase tracking-wider"
            style={{ color: C.ink }}
          >
            First 500 drafters get founder badges + free premium for the season.
          </p>

          {submitted ? (
            <div
              className="mx-auto mt-10 max-w-md p-6 text-2xl font-black italic"
              style={{ background: C.yellow, color: C.ink, border: `4px solid ${C.ink}`, boxShadow: `8px 8px 0 ${C.cyan}` }}
            >
              ★ YOU'RE ON THE ROSTER. ★
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (email) setSubmitted(true);
              }}
              className="mx-auto mt-10 flex max-w-md flex-col gap-3 sm:flex-row"
            >
              <input
                type="email"
                required
                placeholder="YOU@EMAIL.COM"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-14 flex-1 px-4 text-sm font-black uppercase tracking-widest outline-none"
                style={{
                  background: C.paper,
                  color: C.ink,
                  border: `4px solid ${C.ink}`,
                }}
              />
              <button
                type="submit"
                className="h-14 px-6 text-sm font-black italic uppercase tracking-widest transition hover:-translate-y-0.5"
                style={{
                  background: C.yellow,
                  color: C.ink,
                  border: `4px solid ${C.ink}`,
                  boxShadow: `6px 6px 0 ${C.cyan}`,
                }}
              >
                ▶ JOIN
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer
        className="px-6 py-8 text-xs font-black uppercase tracking-widest"
        style={{ background: C.ink, color: C.paper, borderTop: `4px solid ${C.yellow}` }}
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row">
          <span>
            HOOP<span style={{ color: C.magenta }}>ROOM</span> · BUILT FOR HOOPHEADS
          </span>
          <span style={{ color: C.cyan }}>© {new Date().getFullYear()} · ALL BUCKETS RESERVED</span>
        </div>
      </footer>
    </div>
  );
}

function Squiggles({ small = false }: { small?: boolean }) {
  const sz = small ? 0.7 : 1;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute left-4 top-10 opacity-80" width={80 * sz} height={80 * sz} viewBox="0 0 80 80">
        <path d="M5 40 Q 20 10, 40 40 T 75 40" stroke={C.cyan} strokeWidth="6" fill="none" />
      </svg>
      <svg className="absolute right-10 top-20 rotate-12 opacity-90" width={60 * sz} height={60 * sz} viewBox="0 0 60 60">
        <polygon points="30,5 35,25 55,25 40,38 45,58 30,46 15,58 20,38 5,25 25,25" fill={C.yellow} />
      </svg>
      <svg className="absolute bottom-10 left-1/4 opacity-80" width={100 * sz} height={40 * sz} viewBox="0 0 100 40">
        <circle cx="10" cy="20" r="6" fill={C.magenta} />
        <circle cx="30" cy="20" r="6" fill={C.magenta} />
        <circle cx="50" cy="20" r="6" fill={C.magenta} />
        <circle cx="70" cy="20" r="6" fill={C.magenta} />
        <circle cx="90" cy="20" r="6" fill={C.magenta} />
      </svg>
      <svg className="absolute right-1/4 bottom-16 -rotate-12 opacity-90" width={70 * sz} height={70 * sz} viewBox="0 0 70 70">
        <path d="M30 5 L40 30 L60 30 L45 45 L55 65 L30 50 L10 65 L18 45 L5 30 L25 30 Z" fill={C.cyan} />
      </svg>
    </div>
  );
}
