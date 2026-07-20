import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin_")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/users" });
  },
});