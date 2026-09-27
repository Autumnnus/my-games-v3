import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PencilIcon, StarIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { CommentThread } from "@/components/comments";
import { EntryForm } from "@/components/entry-form";
import { GameCover } from "@/components/game-cover";
import { LikeButton } from "@/components/like-button";
import { ReportButton } from "@/components/report-dialog";
import { ScreenshotGrid, ScreenshotUploader } from "@/components/screenshots";
import { StatusBadge } from "@/components/status-badge";
import { DateText } from "@/components/time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, orNotFound, unwrap } from "@/lib/api";
import {
  errorMessage,
  formatDate,
  formatPlaytime,
  formatRating,
  platformLabel,
  storeLabel,
} from "@/lib/format";
import { entryQuery, entryScreenshotsQuery, reactionsQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/e/$id")({
  loader: async ({ context, params }) => {
    const data = await orNotFound(context.queryClient.ensureQueryData(entryQuery(params.id)));
    void context.queryClient.prefetchQuery(entryScreenshotsQuery(params.id));
    return data;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          {
            title: `${loaderData.entry.game.name} · ${loaderData.entry.user.name} · ${m.app_name()}`,
          },
          ...(loaderData.entry.review
            ? [{ name: "description", content: loaderData.entry.review.slice(0, 200) }]
            : []),
          {
            property: "og:title",
            content: `${loaderData.entry.game.name} · ${loaderData.entry.user.name}`,
          },
          ...(loaderData.entry.game.coverUrl
            ? [{ property: "og:image", content: loaderData.entry.game.coverUrl }]
            : []),
        ]
      : [],
  }),
  component: EntryPage,
});

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value ?? m.unknown()}</dd>
    </div>
  );
}

function EntryPage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(entryQuery(id));
  const screenshots = useQuery(entryScreenshotsQuery(id));
  const reactions = useQuery(reactionsQuery("entry", id));
  const entry = data.entry;
  const isOwner = user?.id === entry.userId;
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["entry", id] }),
      queryClient.invalidateQueries({ queryKey: ["library"] }),
      queryClient.invalidateQueries({ queryKey: ["profile"] }),
      queryClient.invalidateQueries({ queryKey: ["history"] }),
      queryClient.invalidateQueries({ queryKey: ["game"] }),
    ]);

  const update = useMutation({
    mutationFn: (values: Parameters<(typeof api.library)[":id"]["$patch"]>[0]["json"]) =>
      unwrap(api.library[":id"].$patch({ param: { id }, json: values })),
    onSuccess: async () => {
      setEditing(false);
      toast.success(m.saved());
      await invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => unwrap(api.library[":id"].$delete({ param: { id } })),
    onSuccess: async () => {
      toast.success(m.deleted());
      await invalidate();
      await navigate({ to: "/u/$username", params: { username: entry.user.username ?? "" } });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="grid gap-8">
      <section className="grid gap-6 sm:grid-cols-[180px_1fr]">
        <GameCover url={entry.game.coverUrl} name={entry.game.name} className="w-40 sm:w-full" />
        <div className="grid content-start gap-4">
          <div className="grid gap-1">
            <Link
              to="/g/$slug"
              params={{ slug: entry.game.slug }}
              className="text-2xl font-semibold hover:underline"
            >
              {entry.game.name}
            </Link>
            <Link
              to="/u/$username"
              params={{ username: entry.user.username ?? "" }}
              className="text-muted-foreground text-sm hover:underline"
            >
              {m.entry_by({ name: entry.user.name })}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={entry.status} />
            {entry.rating !== null && (
              <span className="text-lg font-semibold">{formatRating(entry.rating)}</span>
            )}
            {entry.isFavorite && <StarIcon className="size-4 fill-yellow-400 text-yellow-400" />}
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Detail
              label={m.entry_playtime()}
              value={entry.playtimeMin ? formatPlaytime(entry.playtimeMin) : null}
            />
            <Detail
              label={m.field_platform()}
              value={entry.platform ? platformLabel(entry.platform) : null}
            />
            <Detail label={m.field_store()} value={entry.store ? storeLabel(entry.store) : null} />
            <Detail
              label={m.field_last_played()}
              value={entry.lastPlayedAt ? <DateText value={entry.lastPlayedAt} /> : null}
            />
            <Detail label={m.field_started_at()} value={formatDate(entry.startedAt)} />
            <Detail label={m.field_finished_at()} value={formatDate(entry.finishedAt)} />
            {entry.achievementsTotal ? (
              <Detail
                label="Achievements"
                value={`${entry.achievementsUnlocked ?? 0} / ${entry.achievementsTotal}`}
              />
            ) : null}
          </dl>
          {isOwner && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon />
                {m.action_edit()}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(m.confirm_delete_entry())) remove.mutate();
                }}
              >
                <Trash2Icon />
                {m.action_delete()}
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">{m.field_review()}</h2>
        {entry.review ? (
          <p className="max-w-3xl leading-relaxed whitespace-pre-line">{entry.review}</p>
        ) : (
          <p className="text-muted-foreground text-sm">{m.entry_no_review()}</p>
        )}
        <div className="-ml-2 flex items-center">
          {reactions.data && (
            <LikeButton
              targetType="entry"
              targetId={id}
              count={reactions.data.count}
              liked={reactions.data.viewerReacted}
            />
          )}
          {user && !isOwner && entry.review && <ReportButton targetType="entry" targetId={id} />}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{m.game_screenshots()}</h2>
          {isOwner && <ScreenshotUploader entryId={id} />}
        </div>
        <ScreenshotGrid
          screenshots={screenshots.data?.screenshots ?? []}
          canDelete={() => isOwner || user?.role === "admin"}
        />
      </section>

      <section className="grid max-w-3xl gap-3">
        <CommentThread targetType="entry" targetId={id} showTitle />
      </section>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{entry.game.name}</DialogTitle>
          </DialogHeader>
          <EntryForm
            initial={entry}
            submitLabel={m.action_save()}
            submitting={update.isPending}
            onCancel={() => setEditing(false)}
            onSubmit={(values) => update.mutate(values)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
