import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/unsubscribe")({
  head: () => ({
    meta: [
      { title: "Unsubscribe — HoopRoom" },
      { name: "description", content: "Manage your HoopRoom draft notification emails." },
      { property: "og:title", content: "Unsubscribe — HoopRoom" },
      { property: "og:description", content: "Manage your HoopRoom draft notification emails." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const [status, setStatus] = useState<"loading" | "ready" | "done" | "error">("loading");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) {
      setStatus("error");
      setMessage("This unsubscribe link is missing its token.");
      return;
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Invalid or expired link");
        setStatus("ready");
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Something went wrong.");
      });
  }, []);

  const confirm = async () => {
    if (!token) return;
    setStatus("loading");
    try {
      const res = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error("Could not complete unsubscribe");
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold text-foreground">Email preferences</h1>

        {status === "loading" && <p className="mt-3 text-sm text-muted-foreground">Checking your link…</p>}

        {status === "ready" && (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              You'll stop receiving HoopRoom draft notification emails at this address.
            </p>
            <Button className="mt-6 w-full" onClick={confirm}>
              Confirm unsubscribe
            </Button>
          </>
        )}

        {status === "done" && (
          <p className="mt-3 text-sm text-muted-foreground">
            You're unsubscribed. You can re-enable notifications anytime from your account settings.
          </p>
        )}

        {status === "error" && <p className="mt-3 text-sm text-destructive">{message}</p>}
      </div>
    </main>
  );
}
