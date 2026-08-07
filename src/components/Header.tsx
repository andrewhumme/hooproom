import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { Menu, X, LogOut, User, ChevronDown, Zap, MapPin } from "lucide-react";

function PillNavLink({
  to,
  href,
  children,
  isActive,
  onClick,
}: {
  to?: string;
  href?: string;
  children: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
}) {
  const className = [
    "group relative flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
    isActive
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  ].join(" ");

  const content = (
    <>
      <span>{children}</span>
      <span className="h-0.5 w-full bg-primary scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center rounded-full" />
    </>
  );

  if (href) {
    return (
      <a href={href} onClick={onClick} className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link to={to!} onClick={onClick} className={className}>
      {content}
    </Link>
  );
}

export function Header() {
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileHostOpen, setMobileHostOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isHome = pathname === "/";
  const hostActive = pathname === "/lobby/new" || pathname === "/lobby/new-offline";

  const goHost = (path: "/lobby/new" | "/lobby/new-offline") => {
    setMobileOpen(false);
    setMobileHostOpen(false);
    if (!user) {
      navigate({ to: "/auth", search: { redirect: path } });
      return;
    }
    navigate({ to: path });
  };

  return (
    <header className="sticky top-0 z-50 bg-background/50 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <img
            src="/favicon.png"
            alt="HoopRoom orange H logo"
            className="h-9 w-9 rounded-lg"
            width={36}
            height={36}
          />
          <span className="text-xl font-black tracking-tight">HoopRoom</span>
        </Link>

        {/* Desktop nav — glass pill */}
        <nav className="hidden items-center md:flex rounded-full border border-foreground/10 bg-white/40 backdrop-blur-md px-1 py-1 shadow-sm">
          <PillNavLink to="/lobby" isActive={pathname === "/lobby"}>
            Browse drafts
          </PillNavLink>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={[
                  "group relative flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 outline-none",
                  hostActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <span className="inline-flex items-center gap-1">
                  Start a draft
                  <ChevronDown className="h-3.5 w-3.5" />
                </span>
                <span className="h-0.5 w-full bg-primary scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center rounded-full" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-72">
              <DropdownMenuItem
                onClick={() => goHost("/lobby/new")}
                className="flex cursor-pointer items-start gap-3 p-3"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-black">Online Draft</div>
                  <div className="text-xs font-medium text-muted-foreground">
                    Live multiplayer — mock or real league, everyone joins remotely.
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => goHost("/lobby/new-offline")}
                className="flex cursor-pointer items-start gap-3 p-3"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-black">Offline Draft</div>
                  <div className="text-xs font-medium text-muted-foreground">
                    Host in person with a shared board and per-team links.
                  </div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isHome ? (
            <PillNavLink href="#features">Features</PillNavLink>
          ) : (
            <Link
              to="/"
              hash="features"
              className="group relative flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-200"
            >
              <span>Features</span>
              <span className="h-0.5 w-full bg-primary scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center rounded-full" />
            </Link>
          )}
        </nav>

        {/* Right side — auth */}
        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1.5 font-semibold h-9 px-3">
                  <User className="h-4 w-4" />
                  <span className="max-w-[120px] truncate">
                    {user.user_metadata?.display_name || user.email?.split("@")[0] || "Account"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/me" className="cursor-pointer">Dashboard</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="outline" className="h-9 px-5 rounded-full font-bold hover:bg-primary hover:text-primary-foreground transition-colors">
              <Link to="/auth">Sign In</Link>
            </Button>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 -mr-2"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border bg-background px-6 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-3">
            <Link
              to="/lobby"
              onClick={() => setMobileOpen(false)}
              className="text-[15px] font-medium text-muted-foreground hover:text-primary"
            >
              Browse drafts
            </Link>
            <div>
              <button
                type="button"
                onClick={() => setMobileHostOpen((o) => !o)}
                className="flex w-full items-center justify-between text-[15px] font-medium text-muted-foreground hover:text-primary"
              >
                <span>Start a draft</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${mobileHostOpen ? "rotate-180" : ""}`}
                />
              </button>
              {mobileHostOpen && (
                <div className="mt-2 flex flex-col gap-2 pl-3">
                  <button
                    type="button"
                    onClick={() => goHost("/lobby/new")}
                    className="flex items-start gap-2 text-left text-[14px] font-medium text-muted-foreground hover:text-primary"
                  >
                    <Zap className="mt-0.5 h-4 w-4 text-primary" />
                    <span>
                      <span className="block font-bold text-foreground">Online Draft</span>
                      <span className="block text-xs">Live multiplayer, everyone joins remotely.</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => goHost("/lobby/new-offline")}
                    className="flex items-start gap-2 text-left text-[14px] font-medium text-muted-foreground hover:text-primary"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                    <span>
                      <span className="block font-bold text-foreground">Offline Draft</span>
                      <span className="block text-xs">Host in person with a shared board.</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
            {isHome ? (
              <a
                href="#features"
                onClick={() => setMobileOpen(false)}
                className="text-[15px] font-medium text-muted-foreground hover:text-primary"
              >
                Features
              </a>
            ) : (
              <Link
                to="/"
                hash="features"
                onClick={() => setMobileOpen(false)}
                className="text-[15px] font-medium text-muted-foreground hover:text-primary"
              >
                Features
              </Link>
            )}
            <div className="border-t border-border pt-2">
              {user ? (
                <>
                  <Link
                    to="/me"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 text-[15px] font-medium text-muted-foreground hover:text-primary"
                  >
                    <User className="h-4 w-4" /> Dashboard
                  </Link>
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      signOut();
                    }}
                    className="mt-3 flex items-center gap-2 text-[15px] font-medium text-destructive"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </>
              ) : (
                <Button asChild size="sm" className="w-full font-bold">
                  <Link to="/auth" onClick={() => setMobileOpen(false)}>
                    Sign In
                  </Link>
                </Button>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
