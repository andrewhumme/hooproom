import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  checkIsAdmin,
  claimAdminIfUnclaimed,
  listAdminUsers,
  type AdminUserRow,
} from "@/lib/admin.functions";
import { AppHeader } from "@/components/AppHeader";
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

export const Route = createFileRoute("/_authenticated/admin/users")({
  ssr: false,
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const navigate = useNavigate();
  const check = useServerFn(checkIsAdmin);
  const claim = useServerFn(claimAdminIfUnclaimed);
  const list = useServerFn(listAdminUsers);

  const [status, setStatus] = useState<"loading" | "denied" | "ok">("loading");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Users</h1>
            <p className="text-sm text-muted-foreground">
              Everyone who has created a HoopRoom login.
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
              <CardTitle>{users.length} account{users.length === 1 ? "" : "s"}</CardTitle>
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
                        ) : (
                          <span className="text-xs text-muted-foreground">user</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
