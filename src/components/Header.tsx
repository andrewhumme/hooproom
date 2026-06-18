import { Link, useRouterState } from "@tanstack/react-router";
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
import { Menu, X, LogOut, User, ChevronDown } from "lucide-react";

function NavLink({
  to,
  href,
  children,
  onClick,
}: {
  to?: string;
  href?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const className = "group relative flex flex-col items-center";

  const linkClass =
    "relative z-10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground";

  const underlineClass =
    "h-0.5 w-full bg-primary scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left";

  const content = (
    <>
      <span className={linkClass}>{children}</span>
      <span className={underlineClass} />
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-black">
            H
          </div>
          <span className="text-lg font-black tracking-tight">HoopRoom</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center md:flex">
          <div className="flex items-center gap-1">
            <NavLink to="/lobby">Browse Drafts</NavLink>
            <div className="mx-1 h-4 w-px bg-border" />
            <NavLink to="/lobby/new">Start a Draft</NavLink>
            <div className="mx-1 h-4 w-px bg-border" />
            {isHome ? (
              <NavLink href="#features">Features</NavLink>
            ) : (
              <Link to="/" hash="features" className="group relative flex flex-col items-center">
                <span className="relative z-10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground">
                  Features
                </span>
                <span className="h-0.5 w-full bg-primary scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              </Link>
            )}
          </div>
        </nav>

        {/* Right side — auth */}
        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 font-semibold">
                  <User className="h-4 w-4" />
                  <span className="max-w-[120px] truncate">
                    {user.user_metadata.display_name || user.email?.split("@")[0] || "Account"}
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
            <Button asChild size="sm" variant="outline" className="font-bold">
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
              className="text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              Browse Drafts
            </Link>
            <Link
              to="/lobby/new"
              onClick={() => setMobileOpen(false)}
              className="text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              Start a Draft
            </Link>
            {isHome ? (
              <a
                href="#features"
                onClick={() => setMobileOpen(false)}
                className="text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Features
              </a>
            ) : (
              <Link
                to="/"
                hash="features"
                onClick={() => setMobileOpen(false)}
                className="text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
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
                    className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    <User className="h-4 w-4" /> Dashboard
                  </Link>
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      signOut();
                    }}
                    className="mt-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-destructive"
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
