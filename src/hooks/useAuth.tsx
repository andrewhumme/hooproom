import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True when the current session belongs to a throwaway spectator account. */
  isGuest: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  isGuest: false,
  signOut: async () => {},
});

const GUEST_KEY = "hoopRoom.guestCreds.v1";

function readIsGuest() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(GUEST_KEY) !== null;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    console.log("[useAuth] mount, subscribing");
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log("[useAuth] event", event, !!newSession);
      setSession(newSession);
      setIsGuest(readIsGuest());
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      console.log("[useAuth] getSession", !!data.session);
      setSession(data.session);
      setIsGuest(readIsGuest());
      setLoading(false);
    }).catch((e) => {
      console.error("[useAuth] getSession failed", e);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      localStorage.removeItem(GUEST_KEY);
    } catch {}
    setIsGuest(false);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, isGuest, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Clear the guest marker — call after a real (non-guest) sign-in/up succeeds. */
export function clearGuestMarker() {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {}
}
