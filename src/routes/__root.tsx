import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";


import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/useAuth";
import { Header } from "@/components/Header";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "HoopRoom — Custom NBA Fantasy Draft Platform" },
      { name: "description", content: "Live NBA fantasy mock drafts with real-time picks, smart rankings, and AI draft grades." },
      { name: "author", content: "HoopRoom" },
      { property: "og:title", content: "HoopRoom — Custom NBA Fantasy Draft Platform" },
      { property: "og:description", content: "Live NBA fantasy mock drafts with real-time picks, smart rankings, and AI draft grades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@HoopRoom" },
      { name: "twitter:title", content: "HoopRoom — Custom NBA Fantasy Draft Platform" },
      { name: "twitter:description", content: "Live NBA fantasy mock drafts with real-time picks, smart rankings, and AI draft grades." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5e2df3a8-7156-4637-a2de-533d426bdf1f/id-preview-4c871c53--46312d31-45d5-4004-ad9d-f467b5bea016.lovable.app-1782760097895.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5e2df3a8-7156-4637-a2de-533d426bdf1f/id-preview-4c871c53--46312d31-45d5-4004-ad9d-f467b5bea016.lovable.app-1782760097895.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <Outlet />
        <footer className="border-t border-border bg-background px-6 py-6">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-sm text-muted-foreground md:flex-row">
            <p>© {new Date().getFullYear()} HoopRoom. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <Link to="/terms" className="hover:text-foreground">
                Terms of Service
              </Link>
              <Link to="/privacy" className="hover:text-foreground">
                Privacy Policy
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </AuthProvider>
  );
}

