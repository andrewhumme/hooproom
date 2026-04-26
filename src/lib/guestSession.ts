import { supabase } from "@/integrations/supabase/client";

/**
 * Guest session helper — testing mode only.
 *
 * Lazily creates a throwaway Supabase account on first use and stashes the
 * credentials in localStorage so the same browser reuses the same identity
 * across reloads. This lets users host & join drafts without a real signup
 * flow. Auto-confirm email is enabled at the project level so signup
 * immediately yields a usable session.
 *
 * Replace with real auth before launch.
 */

const STORAGE_KEY = "hoopRoom.guestCreds.v1";

interface GuestCreds {
  email: string;
  password: string;
  displayName: string;
}

function readCreds(): GuestCreds | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GuestCreds;
  } catch {
    return null;
  }
}

function writeCreds(creds: GuestCreds) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

function makeCreds(): GuestCreds {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return {
    email: `guest_${id}@hooproom.test`,
    password: crypto.randomUUID() + crypto.randomUUID(),
    displayName: `Guest-${id.slice(0, 4).toUpperCase()}`,
  };
}

let pending: Promise<void> | null = null;

/**
 * Ensure there's an authenticated Supabase session in this browser. If a guest
 * account already exists in localStorage, sign in with it. Otherwise create one.
 * Safe to call concurrently — duplicate calls share the same in-flight promise.
 */
export async function ensureGuestSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  if (pending) return pending;

  pending = (async () => {
    try {
      let creds = readCreds();

      if (creds) {
        const { error } = await supabase.auth.signInWithPassword({
          email: creds.email,
          password: creds.password,
        });
        if (!error) return;
        // Stale creds (project reset, deleted user) — fall through and recreate.
      }

      creds = makeCreds();
      const { error: signUpErr } = await supabase.auth.signUp({
        email: creds.email,
        password: creds.password,
        options: { data: { display_name: creds.displayName } },
      });
      if (signUpErr) throw signUpErr;
      writeCreds(creds);

      // signUp returns a session when auto-confirm is on, but in case the SDK
      // didn't store it, sign in explicitly.
      const { data: after } = await supabase.auth.getSession();
      if (!after.session) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: creds.email,
          password: creds.password,
        });
        if (signInErr) throw signInErr;
      }
    } finally {
      pending = null;
    }
  })();

  return pending;
}
