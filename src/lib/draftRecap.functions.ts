import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Backup trigger for the post-draft recap emails, called from the summary
 * page. Normally the draft-complete database hook has already sent them;
 * sendRecapsForRoom claims recap_sent_at so a draft is only emailed once.
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

    const request = getRequest();
    const origin = request?.url ? new URL(request.url).origin : "https://hooproom.app";
    const { sendRecapsForRoom } = await import("@/lib/draftRecap.server");
    return sendRecapsForRoom(roomId, origin);
  });
