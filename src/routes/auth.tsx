import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth, clearGuestMarker } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

const authSearchSchema = z.object({
  redirect: z.string().optional().default("/lobby"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: authSearchSchema,
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — HoopRoom" },
      { name: "description", content: "Sign in or create your HoopRoom account to join live NBA mock drafts." },
    ],
  }),
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { session, loading: authLoading, isGuest } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If a guest session is active when the user lands here, sign it out so the
  // sign-in form takes over cleanly (otherwise the guest session immediately
  // redirects to /lobby, which bounces back to /auth — a freeze loop).
  useEffect(() => {
    if (authLoading) return;
    if (session && isGuest) {
      try {
        localStorage.removeItem("hoopRoom.guestCreds.v1");
      } catch {}
      supabase.auth.signOut();
      return;
    }
    if (session && !isGuest) {
      navigate({ to: redirect as "/lobby" });
    }
  }, [authLoading, session, isGuest, navigate, redirect]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Sign out any existing guest session so the real account takes over cleanly.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        await supabase.auth.signOut();
      }
      clearGuestMarker();

      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${redirect}`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(
        msg.includes("Invalid login credentials")
          ? "Wrong email or password."
          : msg.includes("already registered")
            ? "That email is already registered. Try signing in instead."
            : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        await supabase.auth.signOut();
      }
      clearGuestMarker();

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}${redirect}`,
      });
      if (result.error) {
        setError(result.error instanceof Error ? result.error.message : String(result.error));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-black">
              H
            </div>
            <span className="text-lg font-black tracking-tight">HoopRoom</span>
          </Link>
          <Link to="/lobby" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            Browse drafts →
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black tracking-tight">Get in the room.</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to join live NBA mock drafts.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-[var(--shadow-bold)]">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <Button
                type="button"
                variant="outline"
                className="mt-6 h-11 w-full border-2 font-semibold"
                onClick={handleGoogle}
                disabled={busy}
              >
                <GoogleIcon />
                Continue with Google
              </Button>

              <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                or email
                <div className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-4">
                <TabsContent value="signup" className="m-0 space-y-4">
                  <div>
                    <Label htmlFor="display_name">Display name</Label>
                    <Input
                      id="display_name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="courtsidekev"
                      maxLength={40}
                      className="mt-1.5"
                    />
                  </div>
                </TabsContent>

                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="email"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete={tab === "signup" ? "new-password" : "current-password"}
                    className="mt-1.5"
                  />
                </div>

                {error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button type="submit" className="h-11 w-full font-bold" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  {tab === "signup" ? "Create account" : "Sign in"}
                </Button>
              </form>
            </Tabs>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing, you agree to HoopRoom's terms and privacy policy.
          </p>
        </div>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" fill="#34A853" />
      <path d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z" fill="#FBBC05" />
      <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}
