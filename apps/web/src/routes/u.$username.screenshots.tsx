import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ScreenshotGrid } from "@/components/screenshots";
import { userScreenshotsQuery } from "@/lib/queries";

export const Route = createFileRoute("/u/$username/screenshots")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(userScreenshotsQuery(params.username)),
  component: UserScreenshots,
});

function UserScreenshots() {
  const { username } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { data } = useQuery(userScreenshotsQuery(username));
  return (
    <ScreenshotGrid
      screenshots={data?.screenshots ?? []}
      canDelete={(screenshot) => screenshot.userId === user?.id || user?.role === "admin"}
    />
  );
}
