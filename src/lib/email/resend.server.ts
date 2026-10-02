// Outbound email via Resend (https://resend.com/docs/api-reference/emails/send-email).
// Server-only: needs RESEND_API_KEY (a Worker secret; .env.local for local dev).

export const EMAIL_FROM = "HoopRoom <noreply@notify.hooproom.app>";
export const SITE_URL = "https://hooproom.app";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Resend dedupes sends with the same key for 24h. */
  idempotencyKey?: string;
};

export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Sends one email. Returns Resend's message id; throws EmailSendError on failure. */
export async function sendEmail(email: OutgoingEmail): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailSendError("RESEND_API_KEY is not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !body.id) {
    throw new EmailSendError(body.message ?? `Resend responded ${res.status}`, res.status);
  }
  return body.id;
}

export function redactEmail(email: string | null | undefined): string {
  if (!email) return "***";
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "***";
  return `${localPart[0]}***@${domain}`;
}

/**
 * Sends up to 100 emails in one Resend request (one outbound call however many
 * recipients — Workers cap subrequests per invocation). Returns message ids in
 * input order; throws EmailSendError if the batch is rejected.
 */
export async function sendEmailBatch(emails: OutgoingEmail[], idempotencyKey?: string): Promise<string[]> {
  if (emails.length === 0) return [];
  if (emails.length > 100) throw new EmailSendError("Resend batches are limited to 100 emails");
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailSendError("RESEND_API_KEY is not configured");

  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(
      emails.map((e) => ({
        from: EMAIL_FROM,
        to: [e.to],
        subject: e.subject,
        html: e.html,
        text: e.text,
        headers: e.headers,
      })),
    ),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: Array<{ id: string }>; message?: string };
  if (!res.ok || !body.data) {
    throw new EmailSendError(body.message ?? `Resend responded ${res.status}`, res.status);
  }
  return body.data.map((d) => d.id);
}
