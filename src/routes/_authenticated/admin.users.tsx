import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  checkIsAdmin,
  claimAdminIfUnclaimed,
  listAdminUsers,
  deleteUser,
  deleteAllGuestUsers,
  backfillHistoricalStats,
  refreshAdvancedStatsNow,
  refreshRookieFlagsNow,
  type AdminUserRow,
} from "@/lib/admin.functions";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/users")({
  ssr: false,
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const navigate = useNavigate();
  const check = useServerFn(checkIsAdmin);
  const claim = useServerFn(claimAdminIfUnclaimed);
  const list = useServerFn(listAdminUsers);
  const removeUser = useServerFn(deleteUser);
  const removeGuests = useServerFn(deleteAllGuestUsers);
  const backfill = useServerFn(backfillHistoricalStats);
  const refreshAdvanced = useServerFn(refreshAdvancedStatsNow);
  const refreshRookies = useServerFn(refreshRookieFlagsNow);

  const [status, setStatus] = useState<"loading" | "denied" | "ok">("loading");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminUserRow | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dataBusy, setDataBusy] = useState<"backfill" | "advanced" | "rookies" | null>(null);
  const [dataLog, setDataLog] = useState<string[]>([]);

  function appendLog(line: string) {
    setDataLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${line}`]);
  }

  async function handleBackfill() {
    setDataBusy("backfill");
    appendLog("Starting 10-season backfill (2015-16 → 2024-25)…");
    try {
      const { results } = await backfill({
        data: { startSeason: 2016, endSeason: 2025 },
      });
      for (const r of results) {
        if (r.error) appendLog(`Season ${r.season}: ERROR — ${r.error}`);
        else appendLog(`Season ${r.season}: fetched ${r.fetched}, upserted ${r.upserted}`);
      }
      appendLog("Backfill complete.");
      toast.success("Historical backfill complete");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      appendLog(`Backfill failed: ${m}`);
      toast.error(m);
    } finally {
      setDataBusy(null);
    }
  }

  async function handleRefreshAdvanced() {
    setDataBusy("advanced");
    appendLog("Refreshing advanced stats (TS%, USG%, PIE) for current season…");
    try {
      const res = await refreshAdvanced();
      appendLog(
        `Advanced: fetched ${res.fetched} players, matched ${res.matched}, updated ${res.updated}`,
      );
      toast.success("Advanced stats refreshed");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      appendLog(`Advanced refresh failed: ${m}`);
      toast.error(m);
    } finally {
      setDataBusy(null);
    }
  }


  async function handleRefreshRookies() {
    setDataBusy("rookies");
    appendLog("Recomputing rookie flags from NBA.com…");
    try {
      const res = await refreshRookies();
      appendLog(`Rookie flags updated: ${res.rookies} active rookies.`);
      if (res.rookies > 0) toast.success(`${res.rookies} rookies flagged`);
      else toast.error("No rookies returned by NBA.com");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      appendLog(`Rookie refresh failed: ${m}`);
      toast.error(m);
    } finally {
      setDataBusy(null);
    }
  }

  const guestCount = useMemo(() => users.filter((u) => u.is_guest).length, [users]);

  async function load() {
    try {
      const { isAdmin } = await check();
      if (!isAdmin) {
        setStatus("denied");
        return;
      }
      const rows = await list();
      setUsers(rows);
      setStatus("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("denied");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClaim() {
    setClaiming(true);
    try {
      const { claimed } = await claim();
      if (!claimed) {
        setError("Admin already claimed by another account.");
      } else {
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setClaiming(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await removeUser({ data: { userId: pendingDelete.id } });
      toast.success(`Deleted ${pendingDelete.email ?? pendingDelete.id}`);
      setPendingDelete(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePurgeGuests() {
    setBusy(true);
    try {
      const { deleted, failures } = await removeGuests();
      if (failures.length) {
        toast.warning(`Deleted ${deleted} guests, ${failures.length} failed.`);
      } else {
        toast.success(`Deleted ${deleted} guest account${deleted === 1 ? "" : "s"}.`);
      }
      setConfirmPurge(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Admin</h1>
            <p className="text-sm text-muted-foreground">
              Manage player data refreshes and HoopRoom accounts.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate({ to: "/me" })}>
            Back to My Drafts
          </Button>
        </div>

        {status === "loading" && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {status === "denied" && (
          <Card>
            <CardHeader>
              <CardTitle>Admin access required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <p className="text-sm text-muted-foreground">
                If no admin has been set up yet, you can claim it now. This
                works once — the first signed-in user to click becomes admin.
              </p>
              <Button onClick={handleClaim} disabled={claiming}>
                {claiming ? "Claiming…" : "Claim admin (first-time setup)"}
              </Button>
            </CardContent>
          </Card>
        )}

        {status === "ok" && (
          <Card>
            <CardHeader>
              <CardTitle>Player data tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border p-4">
                  <div className="mb-1 text-sm font-bold">Historical backfill</div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Populate 10 seasons of per-game averages (2015-16 → 2024-25)
                    from nbaapi.com into player_season_stats. Safe to re-run —
                    idempotent per player/season. Takes ~30–60s.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleBackfill}
                    disabled={dataBusy !== null}
                  >
                    {dataBusy === "backfill" ? "Backfilling…" : "Backfill 10 seasons"}
                  </Button>
                </div>
                <div className="rounded-md border border-border p-4">
                  <div className="mb-1 text-sm font-bold">Advanced stats</div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Pull TS%, USG%, PIE, AST%, TOV% from stats.nba.com for the
                    current season and patch existing rows. Also runs
                    automatically as part of the weekly cron.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRefreshAdvanced}
                    disabled={dataBusy !== null}
                  >
                    {dataBusy === "advanced" ? "Refreshing…" : "Refresh now"}
                  </Button>
                </div>
                <div className="rounded-md border border-border p-4">
                  <div className="mb-1 text-sm font-bold">Rookie flags</div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Recompute which active players count as rookies (used by the
                    rookies-only draft pool) from NBA.com's rookie leaderboard.
                    Re-run at the start of each season.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRefreshRookies}
                    disabled={dataBusy !== null}
                  >
                    {dataBusy === "rookies" ? "Refreshing…" : "Refresh rookie flags"}
                  </Button>
                </div>
              </div>

              {dataLog.length > 0 && (
                <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-[11px] leading-relaxed">
                  {dataLog.join("\n")}
                </pre>
              )}
            </CardContent>
          </Card>
        )}

        {status === "ok" && (
          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle>
                {users.length} account{users.length === 1 ? "" : "s"}
                {guestCount > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({guestCount} guest{guestCount === 1 ? "" : "s"})
                  </span>
                )}
              </CardTitle>
              {guestCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmPurge(true)}
                  disabled={busy}
                >
                  Delete all guests
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Display name</TableHead>
                    <TableHead>Signed up</TableHead>
                    <TableHead>Last sign-in</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="w-[1%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email ?? "—"}</TableCell>
                      <TableCell>{u.display_name ?? "—"}</TableCell>
                      <TableCell>
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {u.last_sign_in_at
                          ? new Date(u.last_sign_in_at).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {u.is_admin ? (
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                            admin
                          </span>
                        ) : u.is_guest ? (
                          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            guest
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">user</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setPendingDelete(u)}
                          disabled={u.is_admin || busy}
                          title={u.is_admin ? "Can't delete an admin" : "Delete user"}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

      </main>


      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.email ?? pendingDelete?.id} will be permanently
              removed. Any drafts they created or joined will lose this
              participant. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Deleting…" : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPurge} onOpenChange={setConfirmPurge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all guest accounts?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {guestCount} throwaway spectator account
              {guestCount === 1 ? "" : "s"} (emails ending in
              @hooproom.test). Real signups are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePurgeGuests}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Deleting…" : `Delete ${guestCount} guest${guestCount === 1 ? "" : "s"}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
