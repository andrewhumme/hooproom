import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Periodic auction tick: awards any nominations whose deadline has passed.
// Called by pg_cron on a fixed interval. Idempotent.
export const Route = createFileRoute("/api/public/auction-tick")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { data, error } = await supabaseAdmin.rpc("auction_award_due", {
            _room_id: null as unknown as string,
          });
          if (error) {
            console.error("auction_award_due error", error);
            return new Response(
              JSON.stringify({ ok: false, error: error.message }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }
          return Response.json({ ok: true, awarded: data ?? 0 });
        } catch (e) {
          console.error("auction-tick crashed", e);
          return new Response(
            JSON.stringify({ ok: false, error: String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
