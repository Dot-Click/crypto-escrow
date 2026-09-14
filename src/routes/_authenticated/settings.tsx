import { createFileRoute, redirect } from "@tanstack/react-router";

// Notification/security settings moved into the merged "/account" page.
export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/account" });
  },
});
