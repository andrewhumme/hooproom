import { createFileRoute } from "@tanstack/react-router";
import { seedPlayerStatsServer } from "@/lib/playerStats.functions";

export const Route = createFileRoute("/api/public/seed-stats")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await seedPlayerStatsServer();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
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
