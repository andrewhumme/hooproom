import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Periodic lobby tick: auto-fills empty seats with bots and starts any
// waiting room whose auto_start_at deadline has passed. Idempotent.
export const Route = createFileRoute("/api/public/lobby-tick")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { data, error } = await supabaseAdmin.rpc("lobby_autostart_due");
          if (error) {
            console.error("lobby_autostart_due error", error);
            return new Response(
              JSON.stringify({ ok: false, error: error.message }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }
          return Response.json({ ok: true, started: data ?? 0 });
        } catch (e) {
          console.error("lobby-tick crashed", e);
          return new Response(
            JSON.stringify({ ok: false, error: String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
