import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Periodic auction tick: awards any nominations whose deadline has passed.
// Called by pg_cron on a fixed interval. Idempotent.
export const Route = createFileRoute("/api/public/auction-tick")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { data: awarded, error: awardErr } = await supabaseAdmin.rpc(
            "auction_award_due",
            { _room_id: null as unknown as string },
          );
          if (awardErr) {
            console.error("auction_award_due error", awardErr);
            return new Response(
              JSON.stringify({ ok: false, error: awardErr.message }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }
          const { data: nominated, error: nomErr } = await supabaseAdmin.rpc(
            "auction_bot_nominate_due",
          );
          if (nomErr) {
            console.error("auction_bot_nominate_due error", nomErr);
          }
          return Response.json({ ok: true, awarded: awarded ?? 0, nominated: nominated ?? 0 });
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
