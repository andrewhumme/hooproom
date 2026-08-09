import { supabase } from "@/integrations/supabase/client";

/**
 * Guest (spectator) session helper.
 *
 * Uses Supabase anonymous sign-in so someone can watch/join a draft without
 * creating a real account. The session persists in this browser like any other
 * session; a localStorage marker flags it as a guest so the app can restrict
 * guests from account-only surfaces (/me, hosting, etc.).
 *
 * Real accounts go through email/password signup with email confirmation.
 */

const STORAGE_KEY = "hoopRoom.guestCreds.v1";

function markGuest() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ anonymous: true }));
  } catch {}
}

let pending: Promise<void> | null = null;

/**
 * Ensure there's an authenticated Supabase session in this browser. Reuses an
 * existing session (guest or real) when present, otherwise creates an
 * anonymous guest session. Safe to call concurrently.
 */
export async function ensureGuestSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  if (pending) return pending;

  pending = (async () => {
    try {
      const { data: anon, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      if (anon.session) markGuest();
    } finally {
      pending = null;
    }
  })();

  return pending;
}
