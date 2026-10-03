// Called by the database (draft_rooms trigger) when a human team goes on the
// clock in a slow-enough online snake draft. Auth: the publishable key in the
// apikey header, like the other pg_net hooks. claim_on_clock_email() only
// returns a recipient for the room's current pick and records it, so each turn
// is emailed at most once and calling this can't be used to spam.
import { createFileRoute } from "@tanstack/react-router";

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  return parts.join(" ") || `${sec} seconds`;
}

export const Route = createFileRoute("/api/public/hooks/on-clock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || request.headers.get("apikey") !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        let body: { room_id?: unknown; pick_number?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const { room_id: roomId, pick_number: pickNumber } = body;
        if (typeof roomId !== "string" || !/^[0-9a-f-]{36}$/i.test(roomId)) {
          return Response.json({ error: "room_id required" }, { status: 400 });
        }
        if (typeof pickNumber !== "number" || !Number.isInteger(pickNumber) || pickNumber < 1) {
          return Response.json({ error: "pick_number required" }, { status: 400 });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("claim_on_clock_email", {
            _room_id: roomId,
            _pick_number: pickNumber,
          });
          if (error) throw new Error(error.message);
          const r = data?.[0];
          if (!r) return Response.json({ ok: true, sent: false });

          const { sendTemplateEmail } = await import("@/lib/email/transactional.server");
          const result = await sendTemplateEmail({
            templateName: "on-the-clock",
            to: r.email,
            idempotencyKey: `on-clock-${roomId}-${pickNumber}`,
            data: {
              managerName: r.manager_name,
              teamName: r.team_name,
              roomName: r.room_name,
              round: r.round,
              pickInRound: r.pick_in_round,
              overall: pickNumber,
              timeToPick: formatDuration(r.pick_clock_sec),
              draftUrl: `https://hooproom.app/draft/${roomId}`,
            },
          });
          return Response.json({ ok: true, sent: result.status === "sent", status: result.status });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("on-clock email failed", { roomId, pickNumber, message });
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
