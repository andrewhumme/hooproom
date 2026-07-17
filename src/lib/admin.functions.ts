import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const claimAdminIfUnclaimed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("claim_admin_if_unclaimed");
    if (error) throw new Error(error.message);
    return { claimed: !!data };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    return { isAdmin: !!data };
  });

export type AdminUserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  is_guest: boolean;
};

function isGuestEmail(email: string | null): boolean {
  return !!email && /^guest_[a-z0-9]+@hooproom\.test$/i.test(email);
}

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    const { data, error } = await context.supabase.rpc("admin_list_users");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Omit<AdminUserRow, "is_guest">[]).map((u) => ({
      ...u,
      is_guest: isGuestEmail(u.email),
    }));
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");
    if (data.userId === context.userId) throw new Error("You can't delete your own account.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { deleted: true };
  });

export const deleteAllGuestUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { data: rows, error } = await context.supabase.rpc("admin_list_users");
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let deleted = 0;
    const failures: string[] = [];
    for (const u of (rows ?? []) as { id: string; email: string | null }[]) {
      if (!isGuestEmail(u.email)) continue;
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(u.id);
      if (delErr) failures.push(u.email ?? u.id);
      else deleted++;
    }
    return { deleted, failures };
  });

async function requireAdmin(context: {
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  userId: string;
}) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden");
}

/**
 * One-time backfill of historical seasons into player_season_stats.
 * Range is inclusive on both ends. Uses NBA season-end year (e.g. 2016 = 2015-16).
 */
export const backfillHistoricalStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { startSeason: number; endSeason: number }) => input)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    if (data.startSeason < 1980 || data.endSeason > 2100 || data.startSeason > data.endSeason) {
      throw new Error("Invalid season range");
    }
    const { backfillHistoricalSeasons } = await import("@/lib/seasonRefresh.server");
    const results = await backfillHistoricalSeasons(data.startSeason, data.endSeason);
    return { results };
  });

/**
 * Manually trigger the advanced-stats (TS%, USG%, PIE...) refresh for the
 * current season. Useful for immediate backfill after enabling the feature.
 */
export const refreshAdvancedStatsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { refreshAdvancedStats } = await import("@/lib/seasonRefresh.server");
    return await refreshAdvancedStats();
  });
