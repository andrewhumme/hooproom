// Daily cron endpoint (pg_cron). Default: refresh the current season's
// per-game averages and append a dated snapshot row per player.
// ?part=advanced: refresh advanced stats (TS%, USG%, AST%, TOV%) instead —
// a separate call because each part is ~20 API pages and one Worker request
// has a limited subrequest budget.
//
// Auth: Supabase anon `apikey` header (per house convention). The endpoint
// lives under /api/public/* which bypasses the platform's global auth wall,
// so we verify the caller ourselves.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/refresh-season-stats")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        try {
          const { refreshCurrentSeason, refreshAdvancedStats } = await import(
            "@/lib/seasonRefresh.server"
          );
          const part = new URL(request.url).searchParams.get("part");
          const result =
            part === "advanced"
              ? { advanced: await refreshAdvancedStats() }
              : await refreshCurrentSeason();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("refresh-season-stats failed", message);
          return new Response(
            JSON.stringify({ ok: false, error: message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
      // Simple health check
      GET: async () =>
        new Response(
          JSON.stringify({ ok: true, hint: "POST with apikey to refresh" }),
          { headers: { "Content-Type": "application/json" } },
        ),
    },
  },
});
