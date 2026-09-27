import { createFileRoute } from "@tanstack/react-router";
import { Feed } from "@/components/feed";
import { feedQuery } from "@/lib/queries";

export const Route = createFileRoute("/u/$username/activity")({
  loader: ({ context, params }) =>
    context.queryClient.prefetchInfiniteQuery(
      feedQuery({ kind: "user", username: params.username }),
    ),
  component: UserActivity,
});

function UserActivity() {
  const { username } = Route.useParams();
  return (
    <div className="max-w-2xl">
      <Feed scope={{ kind: "user", username }} />
    </div>
  );
}
