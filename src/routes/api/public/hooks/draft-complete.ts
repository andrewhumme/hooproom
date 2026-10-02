// Called by the database (draft_rooms trigger) the moment a draft completes,
// so recap emails go out immediately. Auth: the publishable key in the apikey
// header, like the other pg_cron/pg_net hooks. Calling it can only send a
// completed draft's recap once (recap_sent_at), so it can't be used to spam.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/draft-complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || request.headers.get("apikey") !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        let roomId: unknown;
        try {
          roomId = ((await request.json()) as { room_id?: unknown }).room_id;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        if (typeof roomId !== "string" || !/^[0-9a-f-]{36}$/i.test(roomId)) {
          return Response.json({ error: "room_id required" }, { status: 400 });
        }
        try {
          const { sendRecapsForRoom } = await import("@/lib/draftRecap.server");
          return Response.json({ ok: true, ...(await sendRecapsForRoom(roomId)) });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("draft-complete recap failed", { roomId, message });
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
