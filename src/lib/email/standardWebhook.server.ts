// Verifies Standard Webhooks signatures (https://www.standardwebhooks.com),
// the scheme Supabase Auth hooks use. Secret format: "v1,whsec_<base64>".

const TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Throws unless `body` was signed with `secret` within the last 5 minutes. */
export async function verifyStandardWebhook(
  headers: Headers,
  body: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures) throw new Error("Missing webhook headers");

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) {
    throw new Error("Stale or invalid webhook timestamp");
  }

  const keyB64 = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(keyB64),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = bytesToBase64(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  );

  // Header may carry several space-separated "v1,<sig>" entries.
  const ok = signatures
    .split(" ")
    .some((entry) => entry.startsWith("v1,") && timingSafeEqual(entry.slice(3), expected));
  if (!ok) throw new Error("Invalid webhook signature");
}
