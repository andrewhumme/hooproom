import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Loader2 } from "lucide-react";
import {
  fetchPlayerStatsServer,
  type PlayerSeasonStats,
} from "@/lib/playerStats.functions";

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
};

const SEASON_LABEL: Record<number, string> = {
  2023: "2022-23",
  2024: "2023-24",
  2025: "2024-25",
};

const fmt = (n: number | null | undefined, digits = 1) =>
  n == null ? "—" : Number(n).toFixed(digits);

const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${(Number(n) * 100).toFixed(1)}%`;

export function PlayerStatsModal({ open, onOpenChange, player }: Props) {
  const [stats, setStats] = useState<PlayerSeasonStats[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const playerKey = player?.id ?? null;
  useEffect(() => {
    if (!open || !playerKey) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setStats(null);
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
    return () => {
      cancelled = true;
    };
  }, [open, playerKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {player && (
              <PlayerAvatar
                name={player.name}
                team={player.team ?? ""}
                nbaPlayerId={player.nbaPlayerId ?? null}
              />
            )}
            <div className="min-w-0">
              <DialogTitle className="text-lg font-black">
                {player?.name ?? "Player"}
              </DialogTitle>
              <DialogDescription>
                {player?.team ?? "—"} · {player?.position ?? "—"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Last 3 seasons · per-game averages
          </div>

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
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <Th>Season</Th>
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
                  {stats.map((s) => (
                    <tr key={s.season} className="font-medium">
                      <Td className="font-black">{SEASON_LABEL[s.season] ?? s.season}</Td>
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left whitespace-nowrap">{children}</th>;
}
function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 whitespace-nowrap ${className}`}>{children}</td>;
}
