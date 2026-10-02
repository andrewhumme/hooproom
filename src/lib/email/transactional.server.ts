// Transactional (non-auth) emails rendered from the React Email registry and
// sent through Resend. Honors the suppression list and unsubscribe tokens.
import * as React from "react";
import { render } from "@react-email/render";
import { TEMPLATES } from "@/lib/email-templates/registry";
import { redactEmail, sendEmail, sendEmailBatch, SITE_URL, type OutgoingEmail } from "@/lib/email/resend.server";

export type TemplateSendResult =
  | { status: "sent"; messageId: string }
  | { status: "suppressed" }
  | { status: "failed"; error: string };

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sendTemplateEmail(opts: {
  templateName: string;
  to: string;
  data: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<TemplateSendResult> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const template = TEMPLATES[opts.templateName];
  if (!template) return { status: "failed", error: `Unknown template '${opts.templateName}'` };

  const recipient = (template.to || opts.to).toLowerCase();
  const messageId = crypto.randomUUID();
  const log = (status: string, error_message?: string) =>
    db.from("email_send_log").insert({
      message_id: messageId,
      template_name: opts.templateName,
      recipient_email: recipient,
      status,
      error_message,
    });

  // Suppression check fails closed: if we can't verify, don't send.
  const { data: suppressed, error: suppressionError } = await db
    .from("suppressed_emails")
    .select("id")
    .eq("email", recipient)
    .maybeSingle();
  if (suppressionError) {
    await log("failed", "Suppression check failed");
    return { status: "failed", error: "Suppression check failed" };
  }
  if (suppressed) {
    await log("suppressed");
    return { status: "suppressed" };
  }

  // One unsubscribe token per address; reuse it until it's used.
  let { data: tokenRow } = await db
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", recipient)
    .maybeSingle();
  if (tokenRow?.used_at) {
    await log("suppressed", "Unsubscribe token used but email missing from suppressed list");
    return { status: "suppressed" };
  }
  if (!tokenRow) {
    await db
      .from("email_unsubscribe_tokens")
      .upsert(
        { token: generateToken(), email: recipient },
        { onConflict: "email", ignoreDuplicates: true },
      );
    // Re-read in case a concurrent send won the insert.
    ({ data: tokenRow } = await db
      .from("email_unsubscribe_tokens")
      .select("token, used_at")
      .eq("email", recipient)
      .maybeSingle());
    if (!tokenRow) {
      await log("failed", "Failed to create unsubscribe token");
      return { status: "failed", error: "Failed to create unsubscribe token" };
    }
  }
  const unsubscribeUrl = `${SITE_URL}/unsubscribe?token=${encodeURIComponent(tokenRow.token)}`;

  const element = React.createElement(template.component, opts.data);
  const html = await render(element);
  const text = await render(element, { plainText: true });
  const subject =
    typeof template.subject === "function" ? template.subject(opts.data) : template.subject;

  try {
    const resendId = await sendEmail({
      to: recipient,
      subject,
      html,
      text,
      idempotencyKey: opts.idempotencyKey,
      // Mail clients show an "Unsubscribe" link next to the sender.
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    });
    await log("sent");
    return { status: "sent", messageId: resendId };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("Transactional email failed", {
      template: opts.templateName,
      recipient: redactEmail(recipient),
      error,
    });
    await log("failed", error);
    return { status: "failed", error };
  }
}

/**
 * Batched version of sendTemplateEmail for one template and many recipients.
 * A fixed handful of outbound requests regardless of recipient count:
 * suppression check, unsubscribe tokens, one Resend batch, one log write.
 */
export async function sendTemplateEmailBatch(opts: {
  templateName: string;
  items: Array<{ to: string; data: Record<string, unknown> }>;
  idempotencyKey?: string;
}): Promise<{ sent: number; suppressed: number }> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const template = TEMPLATES[opts.templateName];
  if (!template) throw new Error(`Unknown template '${opts.templateName}'`);

  // De-duplicate addresses (one email per address).
  const byEmail = new Map<string, Record<string, unknown>>();
  for (const it of opts.items) {
    const to = it.to.trim().toLowerCase();
    if (to && !byEmail.has(to)) byEmail.set(to, it.data);
  }
  const emails = [...byEmail.keys()];
  if (emails.length === 0) return { sent: 0, suppressed: 0 };

  // Suppression list fails closed.
  const { data: suppressedRows, error: supErr } = await db
    .from("suppressed_emails")
    .select("email")
    .in("email", emails);
  if (supErr) throw new Error(`Suppression check failed: ${supErr.message}`);
  const suppressed = new Set((suppressedRows ?? []).map((r) => r.email));

  // Unsubscribe tokens: reuse existing, create the missing ones in one go.
  const recipients = emails.filter((e) => !suppressed.has(e));
  const { data: tokenRows } = await db
    .from("email_unsubscribe_tokens")
    .select("email, token, used_at")
    .in("email", recipients);
  const tokens = new Map((tokenRows ?? []).map((t) => [t.email, t]));
  const missing = recipients.filter((e) => !tokens.has(e));
  if (missing.length) {
    await db
      .from("email_unsubscribe_tokens")
      .upsert(
        missing.map((email) => ({ email, token: generateToken() })),
        { onConflict: "email", ignoreDuplicates: true },
      );
    const { data: created } = await db
      .from("email_unsubscribe_tokens")
      .select("email, token, used_at")
      .in("email", missing);
    for (const t of created ?? []) tokens.set(t.email, t);
  }

  const outgoing: OutgoingEmail[] = [];
  const sentTo: string[] = [];
  for (const to of recipients) {
    const tok = tokens.get(to);
    if (!tok || tok.used_at) {
      suppressed.add(to); // unsubscribed (or token unavailable) — don't send
      continue;
    }
    const data = byEmail.get(to)!;
    const element = React.createElement(template.component, data);
    const unsubscribeUrl = `${SITE_URL}/unsubscribe?token=${encodeURIComponent(tok.token)}`;
    outgoing.push({
      to,
      subject: typeof template.subject === "function" ? template.subject(data) : template.subject,
      html: await render(element),
      text: await render(element, { plainText: true }),
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    });
    sentTo.push(to);
  }

  const logRow = (email: string, status: string, error_message?: string) => ({
    message_id: crypto.randomUUID(),
    template_name: opts.templateName,
    recipient_email: email,
    status,
    error_message,
  });
  try {
    await sendEmailBatch(outgoing, opts.idempotencyKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("email_send_log").insert(sentTo.map((em) => logRow(em, "failed", msg)));
    throw e;
  }
  await db
    .from("email_send_log")
    .insert([
      ...sentTo.map((em) => logRow(em, "sent")),
      ...[...suppressed].map((em) => logRow(em, "suppressed")),
    ]);
  return { sent: sentTo.length, suppressed: suppressed.size };
}
