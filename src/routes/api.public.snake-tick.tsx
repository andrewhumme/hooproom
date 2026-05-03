import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Periodic snake-draft tick: autopicks for any room whose pick_deadline
// has passed. Idempotent — re-runs are safe.
export const Route = createFileRoute("/api/public/snake-tick")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { data, error } = await supabaseAdmin.rpc("snake_autopick_due");
          if (error) {
            console.error("snake_autopick_due error", error);
            return new Response(
              JSON.stringify({ ok: false, error: error.message }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }
          return Response.json({ ok: true, picked: data ?? 0 });
        } catch (e) {
          console.error("snake-tick crashed", e);
          return new Response(
            JSON.stringify({ ok: false, error: String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
