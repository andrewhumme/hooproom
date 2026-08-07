import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, User as UserIcon } from "lucide-react";

export function AppHeader({ active }: { active?: "home" | "lobby" | "me" }) {
  const { user, loading, isGuest, signOut } = useAuth();
  const isReal = !!user && !isGuest;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <img
            src="/favicon.png"
            alt="HoopRoom logo"
            className="h-8 w-8 rounded-md"
            width={32}
            height={32}
          />
          <span className="text-lg font-black tracking-tight">HoopRoom</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-semibold md:flex">
          <Link to="/" className={active === "home" ? "text-primary" : "hover:text-primary"}>
            Home
          </Link>
          <Link to="/lobby" className={active === "lobby" ? "text-primary" : "hover:text-primary"}>
            Lobby
          </Link>
          {isReal && (
            <Link to="/me" className={active === "me" ? "text-primary" : "hover:text-primary"}>
              My Drafts
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 md:flex">
            <Button asChild size="sm" variant="outline" className="font-bold">
              <Link to="/lobby">Browse Drafts</Link>
            </Button>
            <Button asChild size="sm" className="font-bold">
              <Link to="/lobby/new">Start a Draft</Link>
            </Button>
          </div>
          {loading ? (
            <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
          ) : isReal ? (
            <>
              <Link
                to="/me"
                className="hidden items-center gap-1.5 text-sm font-semibold hover:text-primary sm:inline-flex"
              >
                <UserIcon className="h-4 w-4" />
                {user.user_metadata?.display_name ?? user.email}
              </Link>
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
