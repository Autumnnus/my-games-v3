import { createFileRoute, redirect } from "@tanstack/react-router";

/** Bu layout altındaki sayfalar oturum ister. */
export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { user: context.user };
  },
});
