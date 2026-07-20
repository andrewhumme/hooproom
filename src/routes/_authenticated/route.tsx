import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const GUEST_KEY = "hoopRoom.guestCreds.v1";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    const isGuest =
      typeof window !== "undefined" && localStorage.getItem(GUEST_KEY) !== null;
    if (error || !data.user || isGuest) {
      throw redirect({ to: "/auth", search: { redirect: location.href || "/me" } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
