import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/new")({
  component: NewRouteRedirect,
  head: () => ({
    meta: [
      { title: "Host a draft — HoopRoom" },
      {
        name: "description",
        content: "Redirecting to the draft room setup screen.",
      },
    ],
  }),
});

function NewRouteRedirect() {
  return <Navigate to="/lobby/new" replace />;
}