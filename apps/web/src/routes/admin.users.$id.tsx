import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  BanIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LogOutIcon,
  MessageSquareTextIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminHeader } from "@/components/admin/shell";
import { Empty, Fact, Panel, Pill } from "@/components/admin/ui";
import { AiLimitsPanel, BanDialog, DangerZone, StoragePanel } from "@/components/admin/user-panels";
import { RelativeTime } from "@/components/time";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  adminApi,
  auditLabel,
  deviceOf,
  formatCompact,
  formatDateTime,
  formatNumber,
  formatUsd,
  purposeLabels,
  userQuery,
} from "@/lib/admin";
import { unwrap } from "@/lib/api";
import { errorMessage, formatDate } from "@/lib/format";
import { avatarThumb } from "@/lib/media/urls";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/admin/users/$id")({
  component: UserPage,
});

const providerLabels: Record<string, () => string> = {
  credential: m.admin_provider_email,
  google: () => "Google",
  discord: () => "Discord",
  steam: () => "Steam",
};

function UserPage() {
  const { id } = Route.useParams();
  const { user: me } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(userQuery(id));
  const [banOpen, setBanOpen] = useState(false);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "user", id] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "audit"] }),
    ]);
  const unban = useMutation({
    mutationFn: () => unwrap(adminApi.users[":id"].unban.$post({ param: { id } })),
    onSuccess: async () => {
      toast.success(m.admin_unbanned_toast());
      await refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const revoke = useMutation({
    mutationFn: () => unwrap(adminApi.users[":id"].sessions.revoke.$post({ param: { id } })),
    onSuccess: async (result) => {
      toast.success(m.admin_sessions_revoked({ count: result.revoked }));
      await refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const resetOnboarding = useMutation({
    mutationFn: () => unwrap(adminApi.users[":id"].onboarding.reset.$post({ param: { id } })),
    onSuccess: async () => {
      toast.success(m.admin_onboarding_reset_done());
      await refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const exportData = useMutation({
    mutationFn: () => unwrap(adminApi.users[":id"].export.$get({ param: { id } })),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `my-games-${data?.user.username ?? id}.json`;
      link.click();
      URL.revokeObjectURL(url);
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  if (isPending) {
    return <div className="bg-card h-40 animate-pulse rounded-[22px] border border-white/8" />;
  }
  if (error || !data) {
    return (
      <Panel>
        <Empty>{m.admin_user_not_found()}</Empty>
      </Panel>
    );
  }

  const { user, counts, ai } = data;
  const self = user.id === me.id;
  const protectedUser = self || user.role === "admin";
  const lastSeen = data.sessions[0]?.updatedAt ?? null;

  return (
    <>
      <Link
        to="/admin/users"
        className="text-foreground/60 hover:text-foreground flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeftIcon className="size-4" />
        {m.admin_nav_users()}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-16 shrink-0">
            {user.image && <AvatarImage src={avatarThumb(user.image)} alt="" />}
            <AvatarFallback className="text-xl">{user.name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 gap-1.5">
            <AdminHeader
              title={user.name}
              eyebrow={
                <span className="flex flex-wrap items-center gap-2">
                  {user.username && (
                    <Link
                      to="/u/$username"
                      params={{ username: user.username }}
                      className="hover:text-foreground flex items-center gap-1"
                    >
                      @{user.username}
                      <ExternalLinkIcon className="size-3.5" />
                    </Link>
                  )}
                  {user.role === "admin" && (
                    <Pill tone="info">
                      <ShieldCheckIcon className="size-3" />
                      {m.admin_badge_admin()}
                    </Pill>
                  )}
                  {user.banned && <Pill tone="danger">{m.admin_badge_banned()}</Pill>}
                  {!user.emailVerified && <Pill tone="warn">{m.admin_badge_unverified()}</Pill>}
                </span>
              }
            />
            <p className="text-foreground/60 m-0 text-sm">
              {m.admin_user_meta({
                joined: formatDate(user.createdAt) ?? "",
                seen: lastSeen ? formatDateTime(lastSeen) : "—",
              })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={exportData.isPending}
            onClick={() => exportData.mutate()}
          >
            <DownloadIcon />
            {m.admin_export()}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={protectedUser || revoke.isPending || data.sessions.length === 0}
            onClick={() => {
              if (window.confirm(m.admin_sessions_confirm())) revoke.mutate();
            }}
          >
            <LogOutIcon />
            {m.admin_sessions_revoke()}
          </Button>
          {user.banned ? (
            <Button
              variant="outline"
              size="sm"
              disabled={unban.isPending}
              onClick={() => unban.mutate()}
            >
              {m.admin_unban()}
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              disabled={protectedUser}
              onClick={() => setBanOpen(true)}
            >
              <BanIcon />
              {m.admin_ban_button()}
            </Button>
          )}
        </div>
      </div>

      {user.banned && (
        <div className="border-destructive/30 bg-destructive/[0.07] rounded-2xl border px-4 py-3 text-sm">
          {user.banExpires
            ? m.admin_banned_until({ until: formatDateTime(user.banExpires) })
            : m.admin_banned_forever()}
          {user.banReason && <span className="text-foreground/70"> — {user.banReason}</span>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <Panel title={m.admin_user_account()}>
            <dl className="m-0">
              <Fact label={m.admin_col_email()}>
                <span className="break-all">{user.email}</span>
              </Fact>
              <Fact label={m.admin_user_logins()}>
                {data.accounts
                  .map((account) => providerLabels[account.providerId]?.() ?? account.providerId)
                  .join(", ") || "—"}
              </Fact>
              <Fact label={m.admin_user_locale()}>{user.locale?.toUpperCase() ?? "—"}</Fact>
              <Fact label={m.admin_user_id()}>
                <code className="text-xs">{user.id}</code>
              </Fact>
              {user.bio && (
                <Fact label={m.admin_user_bio()}>
                  <span className="text-foreground/80 text-[13px]">{user.bio}</span>
                </Fact>
              )}
            </dl>
          </Panel>

          <Panel title={m.admin_user_data()} description={m.admin_user_data_hint()}>
            <dl className="m-0">
              <Fact label={m.admin_count_entries()}>{formatNumber(counts.entries)}</Fact>
              <Fact label={m.admin_count_screenshots()}>
                {m.admin_count_screenshots_value({
                  total: formatNumber(counts.screenshots),
                  uploads: formatNumber(counts.uploads),
                })}
              </Fact>
              <Fact label={m.admin_count_history()}>{formatNumber(counts.history)}</Fact>
              <Fact label={m.admin_count_sessions()}>{formatNumber(counts.playSessions)}</Fact>
              <Fact label={m.admin_count_achievements()}>{formatNumber(counts.achievements)}</Fact>
              <Fact label={m.admin_count_threads()}>{formatNumber(counts.threads)}</Fact>
              <Fact label={m.admin_count_social()}>
                {m.admin_count_social_value({
                  comments: formatNumber(counts.comments),
                  reactions: formatNumber(counts.reactions),
                  activities: formatNumber(counts.activities),
                })}
              </Fact>
              <Fact label={m.admin_count_platforms()}>{formatNumber(counts.platforms)}</Fact>
              <Fact label={m.admin_count_proposals()}>{formatNumber(counts.proposals)}</Fact>
              <Fact label={m.admin_count_reports()}>{formatNumber(counts.reportsFiled)}</Fact>
            </dl>
          </Panel>

          <Panel
            title={m.admin_user_ai()}
            description={m.admin_user_ai_hint({
              cost: formatUsd(ai.last30d.cost),
              tokens: formatCompact(ai.last30d.totalTokens),
              calls: formatNumber(ai.last30d.calls),
            })}
            actions={
              <Link
                to="/admin/ai/traces"
                search={{ userId: user.id }}
                className="text-foreground/65 hover:text-foreground text-xs font-semibold"
              >
                {m.admin_user_all_traces()}
              </Link>
            }
          >
            {ai.threads.length === 0 ? (
              <Empty>{m.admin_user_no_threads()}</Empty>
            ) : (
              <ul className="m-0 grid list-none gap-1 p-0">
                {ai.threads.map((thread) => {
                  const run = ai.runs.find((item) => item.threadId === thread.id);
                  return (
                    <li key={thread.id}>
                      <Link
                        to={run ? "/admin/ai/traces/$id" : "/admin/ai/threads/$id"}
                        params={{ id: run ? run.id : thread.id }}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm transition-colors hover:bg-white/5"
                      >
                        <MessageSquareTextIcon className="text-foreground/50 size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">
                          {thread.title ?? m.ai_new_chat()}
                        </span>
                        <span className="text-foreground/50 shrink-0 text-xs tabular-nums">
                          {m.admin_messages_count({ count: thread.messages })}
                        </span>
                        <RelativeTime
                          value={thread.updatedAt}
                          className="text-foreground/50 shrink-0 text-xs"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {ai.runs.length > 0 && (
              <div className="grid gap-1 border-t border-white/8 pt-3">
                <p className="text-foreground/55 m-0 text-xs font-semibold">
                  {m.admin_user_recent_runs()}
                </p>
                {ai.runs.map((run) => (
                  <Link
                    key={run.id}
                    to="/admin/ai/traces/$id"
                    params={{ id: run.id }}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-white/5"
                  >
                    <Pill
                      tone={
                        run.status === "error"
                          ? "danger"
                          : run.status === "aborted"
                            ? "warn"
                            : "muted"
                      }
                    >
                      {purposeLabels[run.purpose]?.() ?? run.purpose}
                    </Pill>
                    <span className="text-foreground/65 min-w-0 flex-1 truncate font-mono">
                      {run.model}
                    </span>
                    <span className="tabular-nums">{formatUsd(run.cost)}</span>
                    <RelativeTime value={run.createdAt} className="text-foreground/50" />
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <AiLimitsPanel key={`ai-${data.limits.updatedAt ?? "none"}`} detail={data} />
          <StoragePanel key={`storage-${data.storage.quotaUpdatedAt ?? "none"}`} detail={data} />

          <Panel
            title={m.admin_onboarding_title()}
            actions={
              <Button
                size="sm"
                variant="outline"
                disabled={resetOnboarding.isPending}
                onClick={() => resetOnboarding.mutate()}
              >
                <RotateCcwIcon />
                {m.admin_onboarding_reset()}
              </Button>
            }
          >
            {data.onboarding ? (
              <dl className="m-0">
                <Fact label={m.admin_onboarding_started()}>
                  {formatDateTime(data.onboarding.startedAt)}
                </Fact>
                <Fact label={m.admin_onboarding_welcomed()}>
                  {data.onboarding.welcomedAt ? formatDateTime(data.onboarding.welcomedAt) : "—"}
                </Fact>
                <Fact label={m.admin_onboarding_dismissed()}>
                  {data.onboarding.dismissedAt ? formatDateTime(data.onboarding.dismissedAt) : "—"}
                </Fact>
                <Fact label={m.admin_onboarding_completed()}>
                  {data.onboarding.completedAt ? formatDateTime(data.onboarding.completedAt) : "—"}
                </Fact>
                <Fact label={m.admin_onboarding_tips()}>
                  {data.onboarding.seenTips.length ? data.onboarding.seenTips.join(", ") : "—"}
                </Fact>
              </dl>
            ) : (
              <Empty>{m.admin_onboarding_none()}</Empty>
            )}
          </Panel>

          <Panel title={m.admin_user_sessions()} description={m.admin_user_sessions_hint()}>
            {data.sessions.length === 0 ? (
              <Empty>{m.admin_user_no_sessions()}</Empty>
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {data.sessions.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="grid min-w-0">
                      <span className="truncate font-semibold">{deviceOf(row.userAgent)}</span>
                      <span className="text-foreground/55 truncate font-mono text-xs">
                        {row.ipAddress ?? "—"}
                      </span>
                    </span>
                    <RelativeTime
                      value={row.updatedAt}
                      className="text-foreground/55 shrink-0 text-xs"
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={m.admin_user_audit()}>
            {data.audit.length === 0 ? (
              <Empty>{m.admin_user_no_audit()}</Empty>
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {data.audit.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <strong className="font-semibold">{auditLabel(row.action)}</strong>
                      <span className="text-foreground/55"> · {row.adminName}</span>
                    </span>
                    <RelativeTime
                      value={row.createdAt}
                      className="text-foreground/55 shrink-0 text-xs"
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <DangerZone detail={data} self={self} />
      <BanDialog detail={data} open={banOpen} onOpenChange={setBanOpen} />
    </>
  );
}
