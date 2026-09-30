import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

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



/**
 * One-time backfill of historical seasons into player_season_stats.
 * Range is inclusive on both ends. Uses NBA season-end year (e.g. 2016 = 2015-16).
 */
export const backfillHistoricalStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { startSeason: number; endSeason: number }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");
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
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");
    const { refreshAdvancedStats } = await import("@/lib/seasonRefresh.server");
    return await refreshAdvancedStats();
  });

/**
 * Load the current season's per-game stats (what HoopRank, bots and autopick
 * rank on) and today's snapshot. Same work as the daily cron.
 */
export const refreshCurrentSeasonNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");
    const { refreshCurrentSeason } = await import("@/lib/seasonRefresh.server");
    return await refreshCurrentSeason();
  });

async function assertAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden");
}

export type HoopRankSourceStatus = {
  lastImportAt: string | null;
  ranked: number | null;
  matched: number | null;
  lastError: string | null;
};

/** Latest HoopRank source (Sleeper) import, for the Admin Tools panel. */
export const getHoopRankSourceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HoopRankSourceStatus> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: ok }, { data: last }] = await Promise.all([
      supabaseAdmin
        .from("external_rank_imports")
        .select("processed_at, ranked, matched")
        .eq("source", "sleeper")
        .is("error", null)
        .not("processed_at", "is", null)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("external_rank_imports")
        .select("error")
        .eq("source", "sleeper")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      lastImportAt: ok?.processed_at ?? null,
      ranked: ok?.ranked ?? null,
      matched: ok?.matched ?? null,
      lastError: last?.error ?? null,
    };
  });

/**
 * Re-import the HoopRank source now: start the download in the database, then
 * import once it lands (the download runs asynchronously in pg_net).
 */
export const refreshHoopRankSourceNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: reqErr } = await supabaseAdmin.rpc("request_sleeper_ranks");
    if (reqErr) throw new Error(reqErr.message);
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((ok) => setTimeout(ok, 3000));
      const { data, error } = await supabaseAdmin.rpc("import_sleeper_ranks");
      if (error) throw new Error(error.message);
      const result = data as { status: string; ranked?: number; matched?: number; error?: string };
      if (result.status === "ok") return { ranked: result.ranked ?? 0, matched: result.matched ?? 0 };
      if (result.status === "error") throw new Error(result.error ?? "Import failed");
    }
    throw new Error("Download still in progress — the scheduled import will pick it up shortly.");
  });

/** Recompute which active players are rookies (NBA.com rookie leaderboard). */
export const refreshRookieFlagsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");
    const { refreshRookieFlags } = await import("@/lib/rookies.server");
    const rookies = await refreshRookieFlags();
    return { rookies };
  });


/** Re-scan the NBA CDN and record which players actually have a headshot. */
export const refreshHeadshotFlagsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");
    const { refreshHeadshotFlags } = await import("@/lib/headshots.server");
    return await refreshHeadshotFlags();
  });
