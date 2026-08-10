import { createFileRoute } from "@tanstack/react-router";

// Refreshes real NBA draft slots (round + overall pick) for a draft class so
// rookie-only draft boards sort by actual draft order. Idempotent.
export const Route = createFileRoute("/api/public/sync-draft-order")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const yearParam = url.searchParams.get("year");
          const year = yearParam ? Number(yearParam) : undefined;
          const { syncDraftHistory } = await import("@/lib/rookies.server");
          const updated = await syncDraftHistory(
            Number.isFinite(year) ? year : undefined,
          );
          return Response.json({ ok: true, updated });
        } catch (err) {
          return new Response(
            JSON.stringify({ ok: false, error: (err as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
