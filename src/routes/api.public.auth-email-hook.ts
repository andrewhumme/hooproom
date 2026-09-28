import * as React from "react";
import { render } from "@react-email/render";
import { createFileRoute } from "@tanstack/react-router";
import { SignupEmail } from "@/lib/email-templates/signup";
import { InviteEmail } from "@/lib/email-templates/invite";
import { MagicLinkEmail } from "@/lib/email-templates/magic-link";
import { RecoveryEmail } from "@/lib/email-templates/recovery";
import { EmailChangeEmail } from "@/lib/email-templates/email-change";
import { ReauthenticationEmail } from "@/lib/email-templates/reauthentication";
import { redactEmail, sendEmail, SITE_URL } from "@/lib/email/resend.server";
import { verifyStandardWebhook } from "@/lib/email/standardWebhook.server";

// Supabase Auth "Send Email" hook: Supabase calls this instead of sending its
// own emails, and we send HoopRoom-branded templates through Resend.
// Configure in Supabase → Authentication → Hooks with this URL, and store the
// generated secret as the SEND_EMAIL_HOOK_SECRET Worker secret.
// Payload: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook

const SITE_NAME = "HoopRoom";

// Each template has its own props type; they all accept the shared auth props below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TEMPLATES: Record<string, { component: React.ComponentType<any>; subject: string }> = {
  signup: { component: SignupEmail, subject: "Confirm your email" },
  invite: { component: InviteEmail, subject: "You've been invited" },
  magiclink: { component: MagicLinkEmail, subject: "Your login link" },
  recovery: { component: RecoveryEmail, subject: "Reset your password" },
  email_change: { component: EmailChangeEmail, subject: "Confirm your new email" },
  reauthentication: { component: ReauthenticationEmail, subject: "Your verification code" },
};

type HookPayload = {
  user: { email: string; new_email?: string };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
};

// Supabase's expected error shape for auth hooks.
function hookError(status: number, message: string) {
  return Response.json({ error: { http_code: status, message } }, { status });
}

function verifyUrl(tokenHash: string, type: string, redirectTo: string): string {
  const base = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
  const params = new URLSearchParams({
    token: tokenHash,
    type,
    redirect_to: redirectTo || SITE_URL,
  });
  return `${base}/auth/v1/verify?${params}`;
}

async function sendAuthEmail(
  type: string,
  to: string,
  props: Record<string, unknown>,
  idempotencyKey: string,
) {
  const template = TEMPLATES[type];
  const element = React.createElement(template.component, {
    siteName: SITE_NAME,
    siteUrl: SITE_URL,
    recipient: to,
    ...props,
  });
  await sendEmail({
    to,
    subject: template.subject,
    html: await render(element),
    text: await render(element, { plainText: true }),
    idempotencyKey,
  });
}

export const Route = createFileRoute("/api/public/auth-email-hook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SEND_EMAIL_HOOK_SECRET;
        if (!secret) {
          console.error("SEND_EMAIL_HOOK_SECRET not configured");
          return hookError(500, "Email hook not configured");
        }

        const body = await request.text();
        try {
          await verifyStandardWebhook(request.headers, body, secret);
        } catch (e) {
          console.error("Auth email hook rejected", { error: (e as Error).message });
          return hookError(401, "Invalid signature");
        }

        let payload: HookPayload;
        try {
          payload = JSON.parse(body);
        } catch {
          return hookError(400, "Invalid JSON");
        }

        const { user, email_data: d } = payload;
        const type = d?.email_action_type;
        if (!user?.email || !type || !TEMPLATES[type]) {
          return hookError(400, `Unsupported email type: ${type}`);
        }
        // Stable per request so Supabase retries don't send duplicates.
        const baseKey = request.headers.get("webhook-id") ?? crypto.randomUUID();

        try {
          if (type === "email_change") {
            // With Secure Email Change on, Supabase sends two token pairs whose
            // names are reversed for backward compatibility (per Supabase docs):
            //   current address → token     + token_hash_new
            //   new address     → token_new + token_hash
            // With it off, only token + token_hash are sent, for the new address.
            const newEmail = user.new_email ?? user.email;
            const secure = !!d.token_hash_new;
            await sendAuthEmail(
              type,
              newEmail,
              {
                confirmationUrl: verifyUrl(d.token_hash, type, d.redirect_to),
                token: secure ? d.token_new : d.token,
                email: newEmail,
                oldEmail: user.email,
                newEmail,
              },
              `${baseKey}:new`,
            );
            if (secure) {
              await sendAuthEmail(
                type,
                user.email,
                {
                  confirmationUrl: verifyUrl(d.token_hash_new!, type, d.redirect_to),
                  token: d.token,
                  email: user.email,
                  oldEmail: user.email,
                  newEmail,
                },
                `${baseKey}:current`,
              );
            }
          } else {
            await sendAuthEmail(
              type,
              user.email,
              {
                confirmationUrl: verifyUrl(d.token_hash, type, d.redirect_to),
                token: d.token,
                email: user.email,
              },
              baseKey,
            );
          }
        } catch (e) {
          console.error("Auth email send failed", {
            type,
            recipient: redactEmail(user.email),
            error: (e as Error).message,
          });
          return hookError(500, "Failed to send email");
        }

        return Response.json({});
      },
    },
  },
});
