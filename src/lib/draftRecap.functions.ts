import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sends the post-draft recap email to every human participant of a completed
 * draft. Idempotent: the first caller atomically claims `recap_sent_at`, so
 * concurrent clients finishing the same draft only produce one send.
 */
export const sendDraftRecaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { roomId: string }) => {
    if (!input?.roomId || typeof input.roomId !== "string") {
      throw new Error("roomId is required");
    }
    return { roomId: input.roomId };
  })
  .handler(async ({ data, context }) => {
    const { roomId } = data;

    // Caller must be able to see the room (RLS-scoped read as the user).
    const { data: visible } = await context.supabase
      .from("draft_rooms")
      .select("id, status")
      .eq("id", roomId)
      .maybeSingle();

    if (!visible || visible.status !== "complete") {
      return { sent: 0, reason: "not_completed" as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Atomically claim the send.
    const { data: claimed } = await supabaseAdmin
      .from("draft_rooms")
      .update({ recap_sent_at: new Date().toISOString() })
      .eq("id", roomId)
      .eq("status", "complete")
      .is("recap_sent_at", null)
      .select("id, name, room_type")
      .maybeSingle();

    if (!claimed) return { sent: 0, reason: "already_sent" as const };

    const [{ data: participants }, { data: picks }, { data: contacts }] = await Promise.all([
      supabaseAdmin
        .from("draft_participants")
        .select("id, user_id, team_name, draft_position, is_bot")
        .eq("room_id", roomId),
      supabaseAdmin
        .from("draft_picks")
        .select("pick_number, round, team_idx, player_name, player_position")
        .eq("room_id", roomId)
        .order("pick_number", { ascending: true }),
      supabaseAdmin
        .from("draft_participant_contacts")
        .select("participant_id, owner_email")
        .eq("room_id", roomId),
    ]);

    if (!participants?.length) return { sent: 0, reason: "no_participants" as const };

    const contactByParticipant = new Map(
      (contacts ?? []).map((c) => [c.participant_id, c.owner_email]),
    );

    const request = getRequest();
    const origin = request?.url ? new URL(request.url).origin : "https://hooproom.app";
    const summaryUrl = `${origin}/draft/${roomId}/summary`;
    const { sendTemplateEmail } = await import("@/lib/email/transactional.server");

    let sent = 0;

    for (const p of participants) {
      if (p.is_bot) continue;

      // Resolve an email: real account first, then host-supplied contact email.
      let email: string | null = null;
      let managerName = p.team_name ?? "Manager";

      if (p.user_id) {
        const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(p.user_id);
        const u = userRes?.user;
        // Guest (anonymous) accounts have no usable email.
        if (u && !u.is_anonymous && u.email) {
          email = u.email;
          const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
          if (typeof meta['display_name'] === "string" && meta['display_name']) {
            managerName = meta['display_name'] as string;
          }
        }
      }

      if (!email) email = contactByParticipant.get(p.id) ?? null;
      if (!email) continue;

      // draft_picks.team_idx is the 1-based seat, same as draft_position.
      const teamIdx = p.draft_position ?? null;
      const roster = (picks ?? [])
        .filter((pk) => teamIdx != null && pk.team_idx === teamIdx)
        .map((pk) => ({
          round: pk.round,
          pick: pk.pick_number,
          playerName: pk.player_name,
          position: pk.player_position ?? undefined,
        }));

      const result = await sendTemplateEmail({
        templateName: "draft-recap",
        to: email,
        idempotencyKey: `recap:${roomId}:${p.id}`,
        data: {
          managerName,
          roomName: claimed.name,
          teamName: p.team_name,
          roster,
          summaryUrl,
        },
      });
      if (result.status === "sent") sent += 1;
      else if (result.status === "failed") {
        console.error("Failed to send draft recap", { participant: p.id, error: result.error });
      }
    }

    return { sent, reason: "ok" as const };
  });
