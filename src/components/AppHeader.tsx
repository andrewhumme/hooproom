import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";

export function AppHeader({ active }: { active?: "home" | "lobby" }) {
  const { user, loading, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-black">
            H
          </div>
          <span className="text-lg font-black tracking-tight">HoopRoom</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-semibold md:flex">
          <Link to="/" className={active === "home" ? "text-primary" : "hover:text-primary"}>
            Home
          </Link>
          <Link to="/lobby" className={active === "lobby" ? "text-primary" : "hover:text-primary"}>
            Lobby
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
          ) : user ? (
            <>
              <span className="hidden text-sm font-semibold sm:inline">
                {user.user_metadata?.display_name ?? user.email}
              </span>
              <Button size="sm" variant="outline" onClick={signOut} className="font-bold">
                <LogOut /> Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="sm" className="font-bold">
              <Link to="/auth" search={{ redirect: "/lobby" }}>
                Sign in
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
