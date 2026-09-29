import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PencilIcon, StarIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { toast } from "sonner";
import { EntryAchievements } from "@/components/achievements";
import { CommentThread } from "@/components/comments";
import { EntryForm } from "@/components/entry-form";
import { GameCover } from "@/components/game-cover";
import { GameLogo } from "@/components/game-logo";
import { LikeButton } from "@/components/like-button";
import { CompletedStamp, RollingText } from "@/components/motion";
import { ReportButton } from "@/components/report-dialog";
import { ScreenshotGrid, ScreenshotUploader } from "@/components/screenshots";
import { Stage } from "@/components/stage";
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
import {
  entryAchievementsQuery,
  entryQuery,
  entryScreenshotsQuery,
  reactionsQuery,
} from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/e/$id")({
  loader: async ({ context, params }) => {
    const data = await orNotFound(context.queryClient.ensureQueryData(entryQuery(params.id)));
    void context.queryClient.prefetchQuery(entryScreenshotsQuery(params.id));
    void context.queryClient.prefetchQuery(entryAchievementsQuery(params.id));
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
    <div className="grid gap-0.5">
      <dt className="text-foreground/60 text-xs">{label}</dt>
      <dd className="text-[15px] font-bold">{value ?? m.unknown()}</dd>
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
  const [logoFailed, setLogoFailed] = useState(false);
  const [stamp, setStamp] = useState(0);
  const failLogo = useCallback(() => setLogoFailed(true), []);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["entry", id] }),
      queryClient.invalidateQueries({ queryKey: ["library"] }),
      queryClient.invalidateQueries({ queryKey: ["profile"] }),
      queryClient.invalidateQueries({ queryKey: ["history"] }),
      queryClient.invalidateQueries({ queryKey: ["game"] }),
      // Silinen/geri alınan işlemlerin aktiviteleri akıştan hemen düşer.
      queryClient.invalidateQueries({ queryKey: ["feed"] }),
    ]);

  const update = useMutation({
    mutationFn: (values: Parameters<(typeof api.library)[":id"]["$patch"]>[0]["json"]) =>
      unwrap(api.library[":id"].$patch({ param: { id }, json: values })),
    onSuccess: async (_, values) => {
      setEditing(false);
      // "Bitirdim" anı: kayıt yeni bitirildiyse damga vurulur, yoksa sade bir bildirim yeter.
      if (values.status === "completed" && entry.status !== "completed") setStamp((n) => n + 1);
      else toast.success(m.saved());
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
    <div className="grid gap-10">
      <Stage
        items={[
          {
            key: entry.id,
            hero: entry.game.heroUrl,
            cover: entry.game.coverUrl,
            color: entry.game.accentColor,
          },
        ]}
      />
      <section className="grid items-end gap-8 pt-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:pt-40">
        <div className="animate-rise flex items-end gap-6">
          <GameCover
            url={entry.game.coverUrl}
            name={entry.game.name}
            color={entry.game.accentColor}
            transitionName={`cover-${entry.id}`}
            className="w-28 shrink-0 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)] sm:w-40"
          />
          <div className="grid min-w-0 gap-4">
            <Link to="/g/$slug" params={{ slug: entry.game.slug }} className="block">
              {entry.game.logoUrl && !logoFailed ? (
                <h1 className="m-0 flex h-24 items-end sm:h-28">
                  <GameLogo
                    src={entry.game.logoUrl}
                    alt={entry.game.name}
                    onFail={failLogo}
                    className="max-h-full max-w-full object-contain object-left-bottom"
                  />
                </h1>
              ) : (
                <h1 className="font-display m-0 text-3xl leading-tight font-semibold tracking-tight hover:underline sm:text-5xl">
                  {entry.game.name}
                </h1>
              )}
            </Link>
            <Link
              to="/u/$username"
              params={{ username: entry.user.username ?? "" }}
              className="text-foreground/75 w-fit text-sm hover:underline"
            >
              {m.entry_by({ name: entry.user.name })}
            </Link>
          </div>
        </div>

        <aside
          className="glass animate-rise grid gap-5 rounded-[26px] border border-white/12 p-6"
          style={{ animationDelay: "120ms" }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-foreground/70 text-xs font-bold tracking-[0.16em]">
              {isOwner ? m.salon_your_entry() : m.salon_entry_of({ name: entry.user.name })}
            </span>
            <div className="flex items-center gap-2">
              {entry.isFavorite && <StarIcon className="size-4 fill-yellow-400 text-yellow-400" />}
              <StatusBadge status={entry.status} />
            </div>
          </div>
          {entry.rating !== null && (
            <div className="flex items-baseline gap-2">
              <span className="font-display text-7xl leading-none font-semibold tracking-tight">
                {formatRating(entry.rating)}
              </span>
              <span className="text-foreground/60 text-lg">/10</span>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 border-y border-white/10 py-4">
            <Detail
              label={m.entry_playtime()}
              value={
                entry.playtimeMin ? <RollingText value={formatPlaytime(entry.playtimeMin)} /> : null
              }
            />
            <Detail
              label={m.field_platform()}
              value={
                [
                  entry.store ? storeLabel(entry.store) : null,
                  entry.platform ? platformLabel(entry.platform) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || null
              }
            />
            <Detail
              label={m.field_last_played()}
              value={entry.lastPlayedAt ? <DateText value={entry.lastPlayedAt} /> : null}
            />
            <Detail label={m.field_finished_at()} value={formatDate(entry.finishedAt)} />
            <Detail label={m.field_started_at()} value={formatDate(entry.startedAt)} />
            {entry.achievementsTotal ? (
              <Detail
                label={m.achievements_title()}
                value={`${entry.achievementsUnlocked ?? 0} / ${entry.achievementsTotal}`}
              />
            ) : null}
          </dl>
          {isOwner && (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setEditing(true)}>
                <PencilIcon />
                {m.action_edit()}
              </Button>
              <Button
                variant="glass"
                size="icon"
                aria-label={m.action_delete()}
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(m.confirm_delete_entry())) remove.mutate();
                }}
              >
                <Trash2Icon />
              </Button>
            </div>
          )}
        </aside>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-bold">{m.field_review()}</h2>
        {entry.review ? (
          <p className="text-foreground/90 max-w-3xl text-lg leading-relaxed whitespace-pre-line">
            {entry.review}
          </p>
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

      <EntryAchievements entryId={id} />

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{m.game_screenshots()}</h2>
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

      <CompletedStamp trigger={stamp} />
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
