// Post-draft recap emails: each human team gets its drafted roster. Called by
// the draft-complete hook (database trigger, the moment a draft ends) and by
// the summary page as a backup. The first caller claims recap_sent_at, so a
// draft is only ever emailed once.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RecapResult =
  | { sent: number; suppressed: number; reason: "ok" }
  | { sent: 0; reason: "not_completed" | "already_sent" | "no_recipients" };

export async function sendRecapsForRoom(
  roomId: string,
  origin = "https://hooproom.app",
): Promise<RecapResult> {
  const { data: claimed } = await supabaseAdmin
    .from("draft_rooms")
    .update({ recap_sent_at: new Date().toISOString() })
    .eq("id", roomId)
    .eq("status", "complete")
    .is("recap_sent_at", null)
    .select("id, name")
    .maybeSingle();
  if (!claimed) {
    const { data: room } = await supabaseAdmin
      .from("draft_rooms")
      .select("status")
      .eq("id", roomId)
      .maybeSingle();
    return { sent: 0, reason: room?.status === "complete" ? "already_sent" : "not_completed" };
  }

  try {
    const [{ data: recipients, error: rErr }, { data: picks, error: pErr }] = await Promise.all([
      supabaseAdmin.rpc("recap_recipients", { _room_id: roomId }),
      supabaseAdmin
        .from("draft_picks")
        .select("pick_number, round, team_idx, player_name, player_position")
        .eq("room_id", roomId)
        .order("pick_number", { ascending: true }),
    ]);
    if (rErr) throw new Error(`recap recipients: ${rErr.message}`);
    if (pErr) throw new Error(`recap picks: ${pErr.message}`);
    if (!recipients?.length) return { sent: 0, reason: "no_recipients" };

    const summaryUrl = `${origin}/draft/${roomId}/summary`;
    const items = recipients.map((r) => ({
      to: r.email,
      data: {
        managerName: r.manager_name,
        roomName: claimed.name,
        teamName: r.team_name,
        summaryUrl,
        // draft_picks.team_idx is the 1-based seat, same as draft_position.
        roster: (picks ?? [])
          .filter((pk) => r.draft_position != null && pk.team_idx === r.draft_position)
          .map((pk) => ({
            round: pk.round,
            pick: pk.pick_number,
            playerName: pk.player_name,
            position: pk.player_position ?? undefined,
          })),
      },
    }));

    const { sendTemplateEmailBatch } = await import("@/lib/email/transactional.server");
    const res = await sendTemplateEmailBatch({
      templateName: "draft-recap",
      items,
      idempotencyKey: `recap:${roomId}`,
    });
    return { ...res, reason: "ok" };
  } catch (e) {
    // Nothing went out — release the claim so the summary page (or a retry)
    // can try again instead of the draft silently never being emailed.
    await supabaseAdmin.from("draft_rooms").update({ recap_sent_at: null }).eq("id", roomId);
    throw e;
  }
}
