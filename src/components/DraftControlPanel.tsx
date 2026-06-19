import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FastForward,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Settings2,
  Shuffle,
  Undo2,
} from "lucide-react";
import type { DraftablePlayer } from "@/lib/balldontlie";

type RecentPick = {
  id: string;
  pick_number: number;
  team_idx: number;
  player_name: string;
  team_name: string;
};

type Props = {
  roomId: string;
  isDrafting: boolean;
  isAuction: boolean;
  recentPicks: RecentPick[];
  availablePlayers: DraftablePlayer[];
  /** Whether the on-the-clock pick can be force-skipped. Snake only. */
  canForceSkip: boolean;
};

/**
 * Host-only "Draft Control" panel — undo picks, replace a past pick's player,
 * adjust the live clock, and force the current clock to expire (skip / autopick).
 * Visible to host once the draft is running. Stays compact in the status bar.
 */
export function DraftControlPanel({
  roomId,
  isDrafting,
  isAuction,
  recentPicks,
  availablePlayers,
  canForceSkip,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoCount, setUndoCount] = useState(1);
  const [adjustSec, setAdjustSec] = useState(30);
  const [replacePickId, setReplacePickId] = useState<string>("");
  const [replaceSearch, setReplaceSearch] = useState("");

  const callRpc = async <T,>(
    label: string,
    fn: () => Promise<{ error: { message: string } | null; data?: T }>,
  ) => {
    setBusy(label);
    setError(null);
    const { error } = await fn();
    setBusy(null);
    if (error) setError(error.message);
    return !error;
  };

  const handleUndo = async () => {
    const ok = await callRpc("undo", () =>
      supabase.rpc("host_undo_pick", { _room_id: roomId, _count: undoCount }),
    );
    if (ok) setUndoCount(1);
  };

  const handleAdjust = async (delta: number) => {
    await callRpc("clock", () =>
      supabase.rpc("host_adjust_clock", {
        _room_id: roomId,
        _delta_sec: delta,
      }),
    );
  };

  const handleSkip = async () => {
    await callRpc("skip", () =>
      supabase.rpc("host_force_clock_expire", { _room_id: roomId }),
    );
  };

  const replacementOptions = useMemo(() => {
    const q = replaceSearch.trim().toLowerCase();
    const base = q
      ? availablePlayers.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.team ?? "").toLowerCase().includes(q),
        )
      : availablePlayers;
    return base.slice(0, 25);
  }, [availablePlayers, replaceSearch]);

  const handleReplace = async (player: DraftablePlayer) => {
    if (!replacePickId) return;
    const ok = await callRpc("replace", () =>
      supabase.rpc("host_replace_pick", {
        _room_id: roomId,
        _pick_id: replacePickId,
        _player_id: player.id,
        _player_name: player.name,
        _player_position: player.position,
        _player_team: player.team,
      }),
    );
    if (ok) {
      setReplacePickId("");
      setReplaceSearch("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="font-bold border-2 border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
        >
          <Settings2 className="h-4 w-4" />
          Draft Control
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[360px] space-y-4 border-2 p-4 shadow-[var(--shadow-bold)]"
      >
        <div>
          <div className="text-sm font-black">Commissioner controls</div>
          <p className="text-[11px] text-muted-foreground">
            Fix mistakes mid-draft. Everyone in the room sees the change instantly.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* ─── Clock controls ─── */}
        {isDrafting && (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              Live clock
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="font-bold"
                disabled={!!busy}
                onClick={() => handleAdjust(-adjustSec)}
              >
                <Minus className="h-3.5 w-3.5" />
                {adjustSec}s
              </Button>
              <Input
                type="number"
                min={5}
                max={3600}
                value={adjustSec}
                onChange={(e) =>
                  setAdjustSec(
                    Math.max(5, Math.min(3600, Number(e.target.value) || 30)),
                  )
                }
                className="h-8 w-20 text-center text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="font-bold"
                disabled={!!busy}
                onClick={() => handleAdjust(adjustSec)}
              >
                <Plus className="h-3.5 w-3.5" />
                {adjustSec}s
              </Button>
              {busy === "clock" && (
                <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {canForceSkip && (
              <Button
                variant="outline"
                size="sm"
                className="w-full font-bold"
                disabled={!!busy}
                onClick={handleSkip}
              >
                {busy === "skip" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FastForward className="h-3.5 w-3.5" />
                )}
                {isAuction
                  ? "Award all active nominations now"
                  : "Skip pick (autopick now)"}
              </Button>
            )}
          </div>
        )}

        {/* ─── Undo picks ─── */}
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            Rewind picks
          </div>
          {recentPicks.length === 0 ? (
            <p className="text-xs text-muted-foreground">No picks yet.</p>
          ) : (
            <>
              <ul className="max-h-28 space-y-0.5 overflow-y-auto text-[11px]">
                {recentPicks.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="w-7 shrink-0 font-black text-muted-foreground tabular-nums">
                      #{p.pick_number}
                    </span>
                    <span className="truncate font-bold">{p.player_name}</span>
                    <span className="ml-auto truncate text-muted-foreground">
                      {p.team_name}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={Math.min(recentPicks.length, 20)}
                  value={undoCount}
                  onChange={(e) =>
                    setUndoCount(
                      Math.max(
                        1,
                        Math.min(recentPicks.length, Number(e.target.value) || 1),
                      ),
                    )
                  }
                  className="h-8 w-16 text-center text-xs"
                />
                <span className="text-[11px] text-muted-foreground">
                  pick{undoCount === 1 ? "" : "s"}
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto font-bold border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                      disabled={!!busy}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Undo
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Undo the last {undoCount} pick{undoCount === 1 ? "" : "s"}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        The player{undoCount === 1 ? "" : "s"} will go back into
                        the pool and the draft will rewind to that team. Auction
                        budgets refund automatically. This can't be reverted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleUndo}
                        className="bg-amber-600 text-white hover:bg-amber-600/90"
                      >
                        {busy === "undo" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                        Rewind
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          )}
        </div>

        {/* ─── Replace player on a past pick ─── */}
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            Replace a pick's player
          </div>
          {recentPicks.length === 0 ? (
            <p className="text-xs text-muted-foreground">No picks yet.</p>
          ) : (
            <>
              <Select
                value={replacePickId}
                onValueChange={(v) => setReplacePickId(v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose pick…" />
                </SelectTrigger>
                <SelectContent>
                  {recentPicks.slice(0, 30).map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      #{p.pick_number} · {p.team_name} → {p.player_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {replacePickId && (
                <div>
                  <Input
                    value={replaceSearch}
                    onChange={(e) => setReplaceSearch(e.target.value)}
                    placeholder="Search replacement player…"
                    className="h-8 text-xs"
                  />
                  <ul className="mt-1 max-h-40 divide-y divide-border overflow-y-auto rounded-md border border-border bg-background">
                    {replacementOptions.length === 0 ? (
                      <li className="px-2 py-1.5 text-[11px] text-muted-foreground">
                        No available players match.
                      </li>
                    ) : (
                      replacementOptions.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center gap-2 px-2 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-bold">
                              {p.name}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {p.team || "—"} · {p.position || "—"}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px] font-bold"
                            disabled={!!busy}
                            onClick={() => handleReplace(p)}
                          >
                            <Shuffle className="h-3 w-3" />
                            Swap
                          </Button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
