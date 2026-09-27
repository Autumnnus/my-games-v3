import { createFileRoute, Link } from "@tanstack/react-router";
import { Feed, NowPlaying } from "@/components/feed";
import { Button } from "@/components/ui/button";
import { feedQuery, nowPlayingQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchInfiniteQuery(feedQuery({ kind: "global" })),
      context.queryClient.prefetchQuery(nowPlayingQuery),
    ]);
  },
  component: HomePage,
});

function HomePage() {
  const { user } = Route.useRouteContext();

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="grid content-start gap-6">
        {user ? (
          <h1 className="text-2xl font-semibold">{m.home_welcome({ name: user.name })}</h1>
        ) : (
          <section className="grid max-w-xl gap-4 py-6">
            <h1 className="text-4xl font-bold tracking-tight">{m.home_title()}</h1>
            <p className="text-muted-foreground text-lg">{m.home_subtitle()}</p>
            <div className="flex gap-2">
              <Button asChild>
                <Link to="/register">{m.nav_sign_up()}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/login">{m.nav_sign_in()}</Link>
              </Button>
            </div>
          </section>
        )}
        <NowPlaying />
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{m.home_feed_title()}</h2>
          <Feed scope={{ kind: "global" }} />
        </section>
      </div>
    </div>
  );
}
