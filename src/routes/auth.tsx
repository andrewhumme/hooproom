import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

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
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"credentials" | "forgot">("credentials");

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
    setNotice(null);
    setBusy(true);
    try {
      // Sign out any existing guest session so the real account takes over cleanly.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        await supabase.auth.signOut();
      }
      clearGuestMarker();

      if (tab === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${redirect}`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice(
            `Check ${email} for a confirmation link to finish creating your account.`,
          );
        }
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
            : msg.includes("Email not confirmed")
              ? "Confirm your email first — check your inbox for the link we sent."
              : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setNotice(
        `If an account exists for ${email}, a password reset link is on its way.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset email.");
    } finally {
      setBusy(false);
    }
  };




  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black tracking-tight">Get in the room.</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to join live NBA mock drafts.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-[var(--shadow-bold)]">
            {mode === "forgot" ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold">Reset your password</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    We'll email you a link to set a new one.
                  </p>
                </div>
                <div>
                  <Label htmlFor="reset_email">Email</Label>
                  <Input
                    id="reset_email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="email"
                    className="mt-1.5"
                  />
                </div>

                {error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
                {notice && (
                  <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                    {notice}
                  </div>
                )}

                <Button type="submit" className="h-11 w-full font-bold" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  Send reset link
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-sm font-semibold text-muted-foreground hover:text-primary"
                  onClick={() => {
                    setMode("credentials");
                    setError(null);
                    setNotice(null);
                  }}
                >
                  Back to sign in
                </button>
              </form>
            ) : (
              <Tabs
                value={tab}
                onValueChange={(v) => {
                  setTab(v as "signin" | "signup");
                  setError(null);
                  setNotice(null);
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Create account</TabsTrigger>
                </TabsList>

                <form onSubmit={handleEmailAuth} className="mt-6 space-y-4">
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
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {tab === "signin" && (
                        <button
                          type="button"
                          className="text-xs font-semibold text-muted-foreground hover:text-primary"
                          onClick={() => {
                            setMode("forgot");
                            setError(null);
                            setNotice(null);
                          }}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
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
                  {notice && (
                    <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                      {notice}
                    </div>
                  )}

                  <Button type="submit" className="h-11 w-full font-bold" disabled={busy}>
                    {busy && <Loader2 className="animate-spin" />}
                    {tab === "signup" ? "Create account" : "Sign in"}
                  </Button>
                </form>
              </Tabs>
            )}
          </div>


          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing, you agree to HoopRoom's terms and privacy policy.
          </p>
        </div>
      </main>
    </div>
  );
}

