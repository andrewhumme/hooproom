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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";

  return (
    <header className="sticky top-0 z-50 bg-background/50 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-lg">
            H
          </div>
          <span className="text-xl font-black tracking-tight">HoopRoom</span>
        </Link>

        {/* Desktop nav — glass pill */}
        <nav className="hidden items-center md:flex rounded-full border border-foreground/10 bg-white/40 backdrop-blur-md px-1 py-1 shadow-sm">
          <PillNavLink to="/lobby" isActive={pathname === "/lobby"}>
            Browse drafts
          </PillNavLink>
          <PillNavLink to="/lobby/new" isActive={pathname === "/lobby/new"}>
            Start a draft
          </PillNavLink>
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
            <Button asChild size="sm" variant="outline" className="font-bold hover:bg-primary hover:text-primary-foreground transition-colors">
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
            <Link
              to="/lobby/new"
              onClick={() => setMobileOpen(false)}
              className="text-[15px] font-medium text-muted-foreground hover:text-primary"
            >
              Start a draft
            </Link>
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
