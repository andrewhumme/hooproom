import { Flame } from "lucide-react";
import type { PlayerSeasonStats } from "@/lib/playerStats.functions";

export type StatKey =
  | "pts"
  | "reb"
  | "ast"
  | "stl"
  | "blk"
  | "fg3_made"
  | "fg_pct"
  | "ft_pct";

export const STAT_COLUMNS: { key: StatKey; label: string; decimals: number }[] = [
  { key: "pts", label: "PTS", decimals: 1 },
  { key: "reb", label: "REB", decimals: 1 },
  { key: "ast", label: "AST", decimals: 1 },
  { key: "stl", label: "STL", decimals: 1 },
  { key: "blk", label: "BLK", decimals: 1 },
  { key: "fg3_made", label: "3PM", decimals: 1 },
  { key: "fg_pct", label: "FG%", decimals: 3 },
  { key: "ft_pct", label: "FT%", decimals: 3 },
];

export type TeamCategoryTotals = {
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  fg3_made: number | null;
  fg_pct: number | null;
  ft_pct: number | null;
};

export const CAT_META: {
  key: keyof TeamCategoryTotals;
  label: string;
  decimals: number;
  isPct?: boolean;
}[] = [
  { key: "pts", label: "PTS", decimals: 1 },
  { key: "reb", label: "REB", decimals: 1 },
  { key: "ast", label: "AST", decimals: 1 },
  { key: "stl", label: "STL", decimals: 1 },
  { key: "blk", label: "BLK", decimals: 1 },
  { key: "fg3_made", label: "3PM", decimals: 1 },
  { key: "fg_pct", label: "FG%", decimals: 3, isPct: true },
  { key: "ft_pct", label: "FT%", decimals: 3, isPct: true },
];

export function computeTeamTotals(
  teamPicks: { player_id: string }[],
  statsByPlayer: Record<string, PlayerSeasonStats>,
): TeamCategoryTotals {
  const sums = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fg3_made: 0 };
  let fgWeighted = 0,
    ftWeighted = 0,
    fgWeight = 0,
    ftWeight = 0,
    count = 0;
  for (const p of teamPicks) {
    const s = statsByPlayer[p.player_id];
    if (!s) continue;
    count++;
    sums.pts += s.pts ?? 0;
    sums.reb += s.reb ?? 0;
    sums.ast += s.ast ?? 0;
    sums.stl += s.stl ?? 0;
    sums.blk += s.blk ?? 0;
    sums.fg3_made += s.fg3_made ?? 0;
    const gp = s.games_played ?? 0;
    if (s.fg_pct != null && gp > 0) {
      fgWeighted += s.fg_pct * gp;
      fgWeight += gp;
    }
    if (s.ft_pct != null && gp > 0) {
      ftWeighted += s.ft_pct * gp;
      ftWeight += gp;
    }
  }
  if (count === 0) {
    return {
      pts: null,
      reb: null,
      ast: null,
      stl: null,
      blk: null,
      fg3_made: null,
      fg_pct: null,
      ft_pct: null,
    };
  }
  return {
    pts: sums.pts,
    reb: sums.reb,
    ast: sums.ast,
    stl: sums.stl,
    blk: sums.blk,
    fg3_made: sums.fg3_made,
    fg_pct: fgWeight > 0 ? fgWeighted / fgWeight : null,
    ft_pct: ftWeight > 0 ? ftWeighted / ftWeight : null,
  };
}

export function CategoryHeatmap({
  totals,
  allTotals,
}: {
  totals: TeamCategoryTotals;
  allTotals: TeamCategoryTotals[];
}) {
  // Rank-based diverging color: red (bottom) → amber (mid) → green (top)
  // within the league. Falls back to neutral when only one team has picked
  // or the category has no data.
  const rankedTeams = allTotals.length;
  return (
    <div className="border-b border-border bg-background/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        <Flame className="h-3 w-3 text-primary" />
        Category heatmap
        <span className="ml-auto text-[9px] font-bold normal-case tracking-normal text-muted-foreground/70">
          vs. league rank
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {CAT_META.map((c) => {
          const v = totals[c.key];
          const values = allTotals
            .map((t) => t[c.key])
            .filter((n): n is number => n != null);
          // Percentile among teams with data: 0 = worst, 1 = best.
          let percentile: number | null = null;
          if (v != null && values.length > 1) {
            const sorted = [...values].sort((a, b) => a - b);
            const first = sorted.indexOf(v);
            const last = sorted.lastIndexOf(v);
            const avgRank = (first + last) / 2;
            percentile = avgRank / (sorted.length - 1);
          }
          let bg = "transparent";
          let ring = "border-border/70";
          if (percentile != null) {
            const hue = 15 + percentile * 130; // 15 → 145
            const alpha = 0.18 + Math.abs(percentile - 0.5) * 0.35;
            bg = `oklch(0.72 0.16 ${hue.toFixed(1)} / ${alpha.toFixed(2)})`;
            if (percentile >= 0.75) ring = "border-emerald-500/50";
            else if (percentile <= 0.25) ring = "border-red-500/50";
          }
          const formatted =
            v == null
              ? "—"
              : c.isPct
                ? v.toFixed(3).replace(/^0\./, ".")
                : v.toFixed(c.decimals);
          const rankLabel =
            percentile == null
              ? ""
              : ` · rank ${Math.round((1 - percentile) * (rankedTeams - 1)) + 1}/${rankedTeams}`;
          return (
            <div
              key={c.key}
              className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1.5 text-center ${ring}`}
              style={{ backgroundColor: bg }}
              title={`${c.label}: ${formatted}${rankLabel}`}
            >
              <span className="w-full truncate text-sm font-black tabular-nums leading-none">
                {formatted}
              </span>
              <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                {c.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StatCell({
  label,
  value,
  max,
  mode,
  decimals = 1,
  active = false,
  divider = false,
}: {
  label: string;
  value: number | null | undefined;
  max?: number;
  mode?: "zebra" | "heatmap";
  decimals?: number;
  active?: boolean;
  divider?: boolean;
}) {
  let style: React.CSSProperties | undefined;
  if (mode === "heatmap" && value != null && max && max > 0) {
    const ratio = Math.min(1, Math.max(0, Number(value) / max));
    const alpha = 0.1 + ratio * 0.55;
    style = {
      backgroundColor: `color-mix(in oklab, var(--primary) ${(alpha * 100).toFixed(0)}%, transparent)`,
    };
  }
  const formatted =
    value == null
      ? "—"
      : decimals === 3
        ? Number(value).toFixed(3).replace(/^0\./, ".")
        : Number(value).toFixed(decimals);
  return (
    <div
      className={`flex w-11 flex-col items-center px-1 py-0.5 leading-tight ${
        divider ? "border-l border-border/70" : ""
      } ${active && mode !== "heatmap" ? "ring-1 ring-primary/40" : ""}`}
      style={style}
    >
      <span className={active ? "text-primary" : "text-foreground"}>{formatted}</span>
      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
