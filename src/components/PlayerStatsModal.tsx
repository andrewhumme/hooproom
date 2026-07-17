import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Star } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Loader2 } from "lucide-react";
import {
  fetchPlayerStatsServer,
  fetchPlayerNbaIdServer,
  type PlayerSeasonStats,
} from "@/lib/playerStats.functions";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: {
    id: string; // player_key
    name: string;
    team: string | null;
    position: string | null;
    nbaPlayerId?: number | null;
  } | null;
  canDraft?: boolean;
  draftBusy?: boolean;
  isQueued?: boolean;
  showQueue?: boolean;
  onDraft?: () => void;
  onToggleQueue?: () => void;
};

// season = NBA season-end year (2025 = 2024-25). Covers historical backfill
// range plus a safety buffer so labels don't fall back to a bare year.
const SEASON_LABEL: Record<number, string> = Object.fromEntries(
  Array.from({ length: 16 }, (_, i) => {
    const end = 2015 + i; // 2015 → 2030
    return [end, `${end - 1}-${String(end).slice(-2)}`];
  }),
);

type StatKey =
  | "pts"
  | "reb"
  | "ast"
  | "stl"
  | "blk"
  | "tov"
  | "minutes_per_game"
  | "games_played"
  | "fg_pct"
  | "fg3_pct"
  | "ft_pct"
  | "ef_fg_pct"
  | "ts_pct"
  | "usg_pct"
  | "pie";

type StatMeta = {
  key: StatKey;
  label: string;
  isPct?: boolean;
  digits?: number;
};

const STAT_OPTIONS: StatMeta[] = [
  { key: "pts", label: "Points" },
  { key: "reb", label: "Rebounds" },
  { key: "ast", label: "Assists" },
  { key: "stl", label: "Steals" },
  { key: "blk", label: "Blocks" },
  { key: "tov", label: "Turnovers" },
  { key: "minutes_per_game", label: "Minutes" },
  { key: "games_played", label: "Games Played", digits: 0 },
  { key: "fg_pct", label: "FG%", isPct: true },
  { key: "fg3_pct", label: "3P%", isPct: true },
  { key: "ft_pct", label: "FT%", isPct: true },
  { key: "ef_fg_pct", label: "eFG%", isPct: true },
  { key: "ts_pct", label: "True Shooting %", isPct: true },
  { key: "usg_pct", label: "Usage %", isPct: true },
  { key: "pie", label: "Player Impact Est.", isPct: true },
];

const fmt = (n: number | null | undefined, digits = 1) =>
  n == null ? "—" : Number(n).toFixed(digits);

const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${(Number(n) * 100).toFixed(1)}%`;

const fmtBy = (meta: StatMeta, n: number | null | undefined) =>
  meta.isPct ? fmtPct(n) : fmt(n, meta.digits ?? 1);

export function PlayerStatsModal({
  open,
  onOpenChange,
  player,
  canDraft,
  draftBusy,
  isQueued,
  showQueue,
  onDraft,
  onToggleQueue,
}: Props) {
  const [stats, setStats] = useState<PlayerSeasonStats[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [trendStat, setTrendStat] = useState<StatKey>("pts");

  const propNbaId = player?.nbaPlayerId ?? null;
  const [resolvedNbaId, setResolvedNbaId] = useState<number | null>(null);
  const playerKey = player?.id ?? null;
  useEffect(() => {
    if (!open || !playerKey) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setStats(null);
    setResolvedNbaId(null);
    fetchPlayerStatsServer({ data: { playerKey } })
      .then((rows) => {
        if (!cancelled) setStats(rows);
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message ?? "Failed to load stats");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    if (propNbaId == null) {
      fetchPlayerNbaIdServer({ data: { playerKey } })
        .then((id) => {
          if (!cancelled) setResolvedNbaId(id);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [open, playerKey, propNbaId]);

  const effectiveNbaId = propNbaId ?? resolvedNbaId;

  const trendMeta = useMemo(
    () => STAT_OPTIONS.find((s) => s.key === trendStat) ?? STAT_OPTIONS[0],
    [trendStat],
  );

  // Chart data ordered chronologically (oldest → newest).
  const chartData = useMemo(() => {
    if (!stats) return [];
    return stats
      .slice()
      .sort((a, b) => a.season - b.season)
      .map((s) => {
        const raw = s[trendStat as keyof PlayerSeasonStats] as number | null | undefined;
        const value =
          raw == null ? null : trendMeta.isPct ? Number((raw * 100).toFixed(2)) : Number(raw);
        return {
          season: SEASON_LABEL[s.season] ?? String(s.season),
          value,
        };
      });
  }, [stats, trendStat, trendMeta]);

  // Y-axis ticks at full + half increments (e.g. 0, 0.5, 1, 1.5 ...).
  // For percentages, step every 5%.
  const { yDomain, yTicks } = useMemo(() => {
    const nums = chartData
      .map((d) => d.value)
      .filter((v): v is number => v != null);
    if (nums.length === 0) return { yDomain: [0, 1] as [number, number], yTicks: [0, 0.5, 1] };
    const step = trendMeta.isPct ? 5 : 0.5;
    const rawMin = Math.min(...nums);
    const rawMax = Math.max(...nums);
    const min = Math.max(0, Math.floor(rawMin / step) * step);
    const max = Math.ceil((rawMax + step * 0.001) / step) * step;
    const ticks: number[] = [];
    for (let v = min; v <= max + 1e-9; v += step) {
      ticks.push(Number(v.toFixed(2)));
    }
    return { yDomain: [min, max] as [number, number], yTicks: ticks };
  }, [chartData, trendMeta]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-4">
            {player && (
              <PlayerAvatar
                name={player.name}
                team={player.team ?? ""}
                nbaPlayerId={effectiveNbaId}
                size={72}
                shape="square"
              />
            )}

            <div className="min-w-0 flex-1 text-left">
              <DialogTitle className="text-xl font-black">
                {player?.name ?? "Player"}
              </DialogTitle>
              <DialogDescription>
                {player?.team ?? "—"} · {player?.position ?? "—"}
              </DialogDescription>
            </div>

            {(onDraft || (showQueue && onToggleQueue)) && (
              <div className="ml-auto flex shrink-0 items-center gap-2 pr-6">
                {showQueue && onToggleQueue && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onToggleQueue}
                    className="font-bold"
                    title={isQueued ? "Remove from queue" : "Add to queue"}
                  >
                    {isQueued ? (
                      <Star className="h-4 w-4 fill-primary text-primary" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Queue
                  </Button>
                )}
                {onDraft && (
                  <Button
                    size="sm"
                    onClick={onDraft}
                    disabled={!canDraft || draftBusy}
                    variant={canDraft ? "default" : "outline"}
                    className="font-bold"
                  >
                    Draft
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : err ? (
          <div className="py-8 text-center text-sm text-destructive">{err}</div>
        ) : !stats || stats.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No historical stats available for this player.
          </div>
        ) : (
          <Tabs defaultValue="table" className="mt-2 flex min-h-0 flex-1 flex-col">
            <TabsList className="shrink-0 self-start">
              <TabsTrigger value="table">Table</TabsTrigger>
              <TabsTrigger value="trend">Trend</TabsTrigger>
            </TabsList>

            <TabsContent
              value="table"
              className="mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 shrink-0">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Career history · per-game averages
                </div>
                {(() => {
                  const latest = stats.find((s) => (s.games_played ?? 0) > 0);
                  if (!latest) return null;
                  const chips: Array<{ label: string; value: number | null }> = [
                    { label: "TS%", value: latest.ts_pct ?? null },
                    { label: "USG%", value: latest.usg_pct ?? null },
                    { label: "PIE", value: latest.pie ?? null },
                  ];
                  const shown = chips.filter((c) => c.value != null);
                  if (shown.length === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      <span className="text-muted-foreground">
                        {SEASON_LABEL[latest.season] ?? latest.season} advanced:
                      </span>
                      {shown.map((c) => (
                        <span
                          key={c.label}
                          className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5"
                        >
                          {c.label} {(c.value! * 100).toFixed(1)}%
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="mb-1 shrink-0 text-[10px] text-muted-foreground sm:hidden">
                ← swipe to see more stats →
              </div>
              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden rounded-lg border border-border overscroll-x-contain">
                <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
                  <thead className="bg-muted/40 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <Th divider={false}>Season</Th>
                      <Th>Team</Th>
                      <Th>GP</Th>
                      <Th>MIN</Th>
                      <Th>PTS</Th>
                      <Th>REB</Th>
                      <Th>AST</Th>
                      <Th>STL</Th>
                      <Th>BLK</Th>
                      <Th>TOV</Th>
                      <Th>FG%</Th>
                      <Th>3P%</Th>
                      <Th>FT%</Th>
                      <Th>eFG%</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(() => {
                      // 3-year average row from the most recent 3 seasons with games
                      const recent = stats
                        .filter((s) => (s.games_played ?? 0) > 0)
                        .slice()
                        .sort((a, b) => b.season - a.season)
                        .slice(0, 3);
                      if (recent.length < 2) return null;
                      const avg = (k: keyof PlayerSeasonStats) => {
                        const vals = recent
                          .map((s) => s[k] as number | null)
                          .filter((v): v is number => v != null);
                        return vals.length === 0
                          ? null
                          : vals.reduce((a, b) => a + b, 0) / vals.length;
                      };
                      return (
                        <tr className="bg-primary/5 font-bold">
                          <Td divider={false} className="font-black text-primary">
                            {recent.length}-yr avg
                          </Td>
                          <Td>—</Td>
                          <Td>{Math.round(avg("games_played") ?? 0)}</Td>
                          <Td>{fmt(avg("minutes_per_game"))}</Td>
                          <Td>{fmt(avg("pts"))}</Td>
                          <Td>{fmt(avg("reb"))}</Td>
                          <Td>{fmt(avg("ast"))}</Td>
                          <Td>{fmt(avg("stl"))}</Td>
                          <Td>{fmt(avg("blk"))}</Td>
                          <Td>{fmt(avg("tov"))}</Td>
                          <Td>{fmtPct(avg("fg_pct"))}</Td>
                          <Td>{fmtPct(avg("fg3_pct"))}</Td>
                          <Td>{fmtPct(avg("ft_pct"))}</Td>
                          <Td>{fmtPct(avg("ef_fg_pct"))}</Td>
                        </tr>
                      );
                    })()}
                    {stats.map((s) => (
                      <tr key={s.season} className="font-medium">
                        <Td divider={false} className="font-black">
                          {SEASON_LABEL[s.season] ?? s.season}
                        </Td>
                        <Td>{s.team ?? "—"}</Td>
                        <Td>{s.games_played ?? "—"}</Td>
                        <Td>{fmt(s.minutes_per_game)}</Td>
                        <Td>{fmt(s.pts)}</Td>
                        <Td>{fmt(s.reb)}</Td>
                        <Td>{fmt(s.ast)}</Td>
                        <Td>{fmt(s.stl)}</Td>
                        <Td>{fmt(s.blk)}</Td>
                        <Td>{fmt(s.tov)}</Td>
                        <Td>{fmtPct(s.fg_pct)}</Td>
                        <Td>{fmtPct(s.fg3_pct)}</Td>
                        <Td>{fmtPct(s.ft_pct)}</Td>
                        <Td>{fmtPct(s.ef_fg_pct)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>


            <TabsContent
              value="trend"
              className="mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Season-over-season trend
                </div>
                <Select value={trendStat} onValueChange={(v) => setTrendStat(v as StatKey)}>
                  <SelectTrigger className="h-8 w-[180px] text-sm font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.key} value={opt.key}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-h-0 flex-1 rounded-lg border border-border bg-card p-3">
                {chartData.every((d) => d.value == null) ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No data for {trendMeta.label}.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        strokeOpacity={0.6}
                      />
                      <XAxis
                        dataKey="season"
                        stroke="var(--muted-foreground)"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="var(--muted-foreground)"
                        fontSize={12}
                        tickLine={false}
                        domain={yDomain}
                        ticks={yTicks}
                        tickFormatter={(v) =>
                          trendMeta.isPct ? `${v}%` : Number(v).toFixed(1)
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                        formatter={(val: number) => [
                          trendMeta.isPct ? `${val.toFixed(1)}%` : val.toFixed(trendMeta.digits ?? 1),
                          trendMeta.label,
                        ]}
                      />
                      <Line
                        type="linear"
                        dataKey="value"
                        stroke="var(--primary)"
                        strokeWidth={3}
                        dot={{
                          r: 5,
                          fill: "var(--background)",
                          stroke: "var(--primary)",
                          strokeWidth: 2,
                        }}
                        activeDot={{ r: 7, fill: "var(--primary)", stroke: "var(--background)", strokeWidth: 2 }}
                        isAnimationActive={false}
                        connectNulls
                      />

                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="mt-3 grid shrink-0 grid-cols-3 gap-2 text-center">
                {chartData.map((d) => (
                  <div
                    key={d.season}
                    className="rounded-md border border-border bg-muted/30 px-2 py-1.5"
                  >
                    <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      {d.season}
                    </div>
                    <div className="text-base font-black tabular-nums">
                      {d.value == null
                        ? "—"
                        : trendMeta.isPct
                          ? `${d.value.toFixed(1)}%`
                          : fmtBy(trendMeta, d.value)}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Th({
  children,
  divider = true,
}: {
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <th
      className="bg-muted/40 px-3 py-2 text-left whitespace-nowrap"
      style={divider ? { borderLeft: "1px solid color-mix(in oklch, var(--muted-foreground) 20%, var(--border))" } : undefined}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  className = "",
  divider = true,
}: {
  children: React.ReactNode;
  className?: string;
  divider?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2 whitespace-nowrap ${className}`}
      style={divider ? { borderLeft: "1px solid color-mix(in oklch, var(--muted-foreground) 20%, var(--border))" } : undefined}
    >
      {children}
    </td>
  );
}
