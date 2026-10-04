import type { AdminAppType } from "@my-games/api";
import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { hc } from "hono/client";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { apiFetch, unwrap } from "./api";

/**
 * Yönetim API'sinin istemcisi. Uygulamanın `api` istemcisinden ayrı tiplenir: admin route'ları ana
 * istemcinin tipini büyütmez, bu modül de yalnızca /admin sayfalarının parçasına girer.
 */
export const adminApi = hc<AdminAppType>("/api/v1/admin", { fetch: apiFetch });

type Data<T extends { queryFn?: unknown }> = Awaited<
  ReturnType<Extract<NonNullable<T["queryFn"]>, (...args: never[]) => unknown>>
>;

export const overviewQuery = queryOptions({
  queryKey: ["admin", "overview"],
  queryFn: () => unwrap(adminApi.overview.$get()),
  refetchInterval: 60_000,
});

export type UserListSearch = {
  q?: string;
  filter?: "all" | "admins" | "banned" | "unverified";
  sort?: "newest" | "oldest" | "active" | "entries" | "storage";
  page?: number;
};

export const usersQuery = (search: UserListSearch) =>
  queryOptions({
    queryKey: ["admin", "users", search],
    queryFn: () =>
      unwrap(
        adminApi.users.$get({
          query: {
            q: search.q || undefined,
            filter: search.filter,
            sort: search.sort,
            page: search.page ? String(search.page) : undefined,
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
export type AdminUserRow = Data<ReturnType<typeof usersQuery>>["users"][number];

export const userQuery = (id: string) =>
  queryOptions({
    queryKey: ["admin", "user", id],
    queryFn: () => unwrap(adminApi.users[":id"].$get({ param: { id } })),
    retry: false,
  });
export type AdminUserDetail = Data<ReturnType<typeof userQuery>>;

export const reportsQuery = (status: "open" | "resolved" | "dismissed") =>
  queryOptions({
    queryKey: ["admin", "reports", status],
    queryFn: () => unwrap(adminApi.reports.$get({ query: { status } })),
  });

export const storageQuery = queryOptions({
  queryKey: ["admin", "storage"],
  queryFn: () => unwrap(adminApi.storage.$get()),
});

export const aiKeysQuery = queryOptions({
  queryKey: ["admin", "ai", "keys"],
  queryFn: () => unwrap(adminApi.ai.$get()),
  refetchInterval: 15_000,
});

export type CostRange = "today" | "7d" | "30d" | "month";
export const costsQuery = (range: CostRange) =>
  queryOptions({
    queryKey: ["admin", "ai", "costs", range],
    queryFn: () => unwrap(adminApi.ai.costs.$get({ query: { range } })),
    placeholderData: keepPreviousData,
  });
export type CostSummary = Data<ReturnType<typeof costsQuery>>;

export type TraceSearch = {
  status?: "ok" | "error" | "aborted";
  purpose?: "chat" | "title" | "pick" | "review" | "recap";
  userId?: string;
};
export const tracesQuery = (search: TraceSearch) =>
  infiniteQueryOptions({
    queryKey: ["admin", "ai", "traces", search],
    queryFn: ({ pageParam }) =>
      unwrap(adminApi.ai.traces.$get({ query: { ...search, before: pageParam } })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    placeholderData: keepPreviousData,
  });
export type TraceRow = Data<ReturnType<typeof tracesQuery>>["traces"][number];

export const traceQuery = (id: string) =>
  queryOptions({
    queryKey: ["admin", "ai", "trace", id],
    queryFn: () => unwrap(adminApi.ai.traces[":id"].$get({ param: { id } })),
    retry: false,
  });
export type TraceDetail = Data<ReturnType<typeof traceQuery>>;

export const systemQuery = queryOptions({
  queryKey: ["admin", "system"],
  queryFn: () => unwrap(adminApi.system.$get()),
  refetchInterval: 30_000,
});
export type SystemStatus = Data<typeof systemQuery>;

export type LogSearch = {
  level?: "info" | "warn" | "error" | "problems";
  source?: string;
  q?: string;
};
export const logsQuery = (search: LogSearch, live = false) =>
  infiniteQueryOptions({
    queryKey: ["admin", "logs", search],
    queryFn: ({ pageParam }) =>
      unwrap(
        adminApi.logs.$get({
          query: {
            level: search.level,
            source: search.source || undefined,
            q: search.q || undefined,
            before: pageParam ? String(pageParam) : undefined,
          },
        }),
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    placeholderData: keepPreviousData,
    // Canlı izleme yalnızca ilk sayfayı yeniler (eski sayfalar değişmez).
    refetchInterval: live ? 10_000 : false,
  });
export type LogRow = Data<ReturnType<typeof logsQuery>>["logs"][number];

export const auditQuery = infiniteQueryOptions({
  queryKey: ["admin", "audit"],
  queryFn: ({ pageParam }) => unwrap(adminApi.audit.$get({ query: { before: pageParam } })),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last) => last.nextBefore ?? undefined,
});
export type AuditRow = Data<typeof auditQuery>["entries"][number];

export const settingsQuery = queryOptions({
  queryKey: ["admin", "settings"],
  queryFn: () => unwrap(adminApi.settings.$get()),
});
export type AdminSettings = Data<typeof settingsQuery>;

// --- Biçimlendirme ---

/** Maliyet: küçük tutarlar kaybolmasın diye 1 doların altında 4, altında 0,01'in altında 5 ondalık. */
export function formatUsd(value: number) {
  const digits = value === 0 ? 2 : value < 0.01 ? 5 : value < 1 ? 4 : 2;
  return new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** 12.900 → "12,9 B" / "12.9K" (kısa gösterim; tam değer title'da). */
export function formatCompact(value: number) {
  return new Intl.NumberFormat(getLocale(), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatNumber(value: number) {
  return value.toLocaleString(getLocale());
}

export function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  const [sec, min] = getLocale() === "tr" ? ["sn", "dk"] : ["s", "min"];
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000)
    return `${(ms / 1000).toLocaleString(getLocale(), { maximumFractionDigits: 1 })} ${sec}`;
  return `${Math.floor(ms / 60_000)} ${min} ${Math.round((ms % 60_000) / 1000)} ${sec}`;
}

export function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return m.admin_uptime_days({ days, hours });
  if (hours > 0) return m.admin_uptime_hours({ hours, minutes });
  return m.admin_uptime_minutes({ minutes });
}

export function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export const purposeLabels: Record<string, () => string> = {
  chat: m.admin_purpose_chat,
  title: m.admin_purpose_title,
  pick: m.admin_purpose_pick,
  review: m.admin_purpose_review,
  recap: m.admin_purpose_recap,
  estimates: m.admin_purpose_estimates,
  endings: m.admin_purpose_endings,
};

export const purgeLabels = {
  library: { title: m.admin_purge_library, hint: m.admin_purge_library_hint },
  screenshots: { title: m.admin_purge_screenshots, hint: m.admin_purge_screenshots_hint },
  ai: { title: m.admin_purge_ai, hint: m.admin_purge_ai_hint },
  social: { title: m.admin_purge_social, hint: m.admin_purge_social_hint },
  platforms: { title: m.admin_purge_platforms, hint: m.admin_purge_platforms_hint },
  profile: { title: m.admin_purge_profile, hint: m.admin_purge_profile_hint },
} as const;
export type PurgeCategory = keyof typeof purgeLabels;

const auditActions: Record<string, () => string> = {
  "user.ban": m.admin_action_ban,
  "user.unban": m.admin_action_unban,
  "user.onboarding_reset": m.admin_action_onboarding_reset,
  "user.sessions_revoke": m.admin_action_sessions,
  "user.storage_quota": m.admin_action_quota,
  "user.ai_limits": m.admin_action_ai_limits,
  "user.purge": m.admin_action_purge,
  "user.delete": m.admin_action_delete,
  "user.export": m.admin_action_export,
  "ai.thread.view": m.admin_action_thread_view,
  "report.resolved": m.admin_action_report_resolved,
  "report.dismissed": m.admin_action_report_dismissed,
  "storage.default_quota": m.admin_action_default_quota,
  "settings.update": m.admin_action_settings,
  "ai.models": m.admin_action_models,
  "outbox.retry": m.admin_action_outbox_retry,
  "role.grant": m.admin_action_role_grant,
  "role.revoke": m.admin_action_role_revoke,
};
export const auditLabel = (action: string) => auditActions[action]?.() ?? action;

/** Tarayıcı kimliğinden kısa bir cihaz adı ("Chrome · macOS"). */
export function deviceOf(userAgent: string | null) {
  if (!userAgent) return m.admin_device_unknown();
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : null;
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  return [browser, os].filter(Boolean).join(" · ") || userAgent.slice(0, 40);
}
