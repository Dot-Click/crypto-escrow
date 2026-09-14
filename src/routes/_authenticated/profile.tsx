import { createFileRoute, redirect } from "@tanstack/react-router";

// "/profile" is now the public profile page (see routes/traders.$userId.tsx)
// — this redirects a signed-in user to their own. Account management moved
// to "/account".
export const Route = createFileRoute("/_authenticated/profile")({
  beforeLoad: ({ context }) => {
    throw redirect({ to: "/traders/$userId", params: { userId: context.user.id } });
  },
});
