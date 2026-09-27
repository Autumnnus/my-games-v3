import type { EntryStatus } from "@my-games/shared";
import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";

export type LibraryFilters = {
  status?: EntryStatus;
  q?: string;
  sort?: "updated" | "name" | "rating" | "playtime" | "last_played" | "finished";
  order?: "asc" | "desc";
  favorites?: boolean;
};

export const profileQuery = (username: string) =>
  queryOptions({
    queryKey: ["profile", username.toLowerCase()],
    queryFn: () => unwrap(api.users[":username"].$get({ param: { username } })),
  });

export const libraryQuery = (username: string, filters: LibraryFilters = {}) =>
  queryOptions({
    queryKey: ["library", username.toLowerCase(), filters],
    queryFn: () =>
      unwrap(
        api.users[":username"].library.$get({
          param: { username },
          query: {
            status: filters.status,
            q: filters.q || undefined,
            sort: filters.sort,
            order: filters.order,
            favorites: filters.favorites ? "1" : undefined,
            limit: "500",
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });

export const gameQuery = (slug: string) =>
  queryOptions({
    queryKey: ["game", slug],
    queryFn: () => unwrap(api.games[":slug"].$get({ param: { slug } })),
  });

export const gameScreenshotsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["screenshots", "game", slug],
    queryFn: () => unwrap(api.games[":slug"].screenshots.$get({ param: { slug } })),
  });

export const entryQuery = (id: string) =>
  queryOptions({
    queryKey: ["entry", id],
    queryFn: () => unwrap(api.library[":id"].$get({ param: { id } })),
  });

export const entryScreenshotsQuery = (id: string) =>
  queryOptions({
    queryKey: ["screenshots", "entry", id],
    queryFn: () => unwrap(api.library[":id"].screenshots.$get({ param: { id } })),
  });

export const userScreenshotsQuery = (username: string) =>
  queryOptions({
    queryKey: ["screenshots", "user", username.toLowerCase()],
    queryFn: () => unwrap(api.users[":username"].screenshots.$get({ param: { username } })),
  });

export const myEntryQuery = (gameId: string) =>
  queryOptions({
    queryKey: ["my-entry", gameId],
    queryFn: () => unwrap(api.me.entry.$get({ query: { gameId } })),
  });

export const historyQuery = (entryId?: string) =>
  queryOptions({
    queryKey: ["history", entryId ?? "all"],
    queryFn: () => unwrap(api.history.$get({ query: { entryId } })),
  });

export type LibraryItem = Awaited<
  ReturnType<NonNullable<ReturnType<typeof libraryQuery>["queryFn"]>>
>["items"][number];
export type Entry = Awaited<
  ReturnType<NonNullable<ReturnType<typeof entryQuery>["queryFn"]>>
>["entry"];
export type Screenshot = Awaited<
  ReturnType<NonNullable<ReturnType<typeof entryScreenshotsQuery>["queryFn"]>>
>["screenshots"][number];

export const proposalsQuery = (status: "pending" | "resolved" = "pending") =>
  queryOptions({
    queryKey: ["proposals", status],
    queryFn: () => unwrap(api.proposals.$get({ query: { status } })),
  });

export const proposalCountQuery = queryOptions({
  queryKey: ["proposals", "count"],
  queryFn: () => unwrap(api.proposals.count.$get()),
  staleTime: 60_000,
});

export const syncRulesQuery = queryOptions({
  queryKey: ["sync", "rules"],
  queryFn: () => unwrap(api.sync.rules.$get()),
});

export const syncIgnoresQuery = queryOptions({
  queryKey: ["sync", "ignores"],
  queryFn: () => unwrap(api.sync.ignores.$get()),
});

export type Proposal = Awaited<
  ReturnType<NonNullable<ReturnType<typeof proposalsQuery>["queryFn"]>>
>["proposals"][number];

export const steamQuery = queryOptions({
  queryKey: ["steam"],
  queryFn: () => unwrap(api.steam.$get()),
});

export const platformsQuery = queryOptions({
  queryKey: ["platforms"],
  queryFn: () => unwrap(api.platforms.$get()),
});

export const entryAchievementsQuery = (id: string) =>
  queryOptions({
    queryKey: ["achievements", id],
    queryFn: () => unwrap(api.library[":id"].achievements.$get({ param: { id } })),
  });

export type AchievementSet = Awaited<
  ReturnType<NonNullable<ReturnType<typeof entryAchievementsQuery>["queryFn"]>>
>["sets"][number];

export type FeedScope =
  | { kind: "global" }
  | { kind: "user"; username: string }
  | { kind: "game"; slug: string };

export const feedQuery = (scope: FeedScope) =>
  infiniteQueryOptions({
    queryKey: ["feed", scope],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const query = { cursor: pageParam };
      if (scope.kind === "user") {
        return unwrap(
          api.users[":username"].activity.$get({ param: { username: scope.username }, query }),
        );
      }
      if (scope.kind === "game") {
        return unwrap(api.games[":slug"].activity.$get({ param: { slug: scope.slug }, query }));
      }
      return unwrap(api.feed.$get({ query }));
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

export const nowPlayingQuery = queryOptions({
  queryKey: ["now-playing"],
  queryFn: () => unwrap(api["now-playing"].$get()),
  refetchInterval: 120_000,
});

export const commentsQuery = (targetType: "activity" | "entry" | "screenshot", targetId: string) =>
  queryOptions({
    queryKey: ["comments", targetType, targetId],
    queryFn: () => unwrap(api.comments.$get({ query: { targetType, targetId } })),
  });

export const reactionsQuery = (targetType: "activity" | "entry" | "screenshot", targetId: string) =>
  queryOptions({
    queryKey: ["reactions", targetType, targetId],
    queryFn: () => unwrap(api.reactions.$get({ query: { targetType, targetId } })),
  });

export const notificationsQuery = queryOptions({
  queryKey: ["notifications", "list"],
  queryFn: () => unwrap(api.notifications.$get({ query: {} })),
});

export const unreadQuery = queryOptions({
  queryKey: ["notifications", "unread"],
  queryFn: () => unwrap(api.notifications.unread.$get()),
  staleTime: 5 * 60_000,
});

export const notificationPrefsQuery = queryOptions({
  queryKey: ["notifications", "preferences"],
  queryFn: () => unwrap(api.notifications.preferences.$get()),
});

export const reportsQuery = (status: "open" | "resolved" | "dismissed" = "open") =>
  queryOptions({
    queryKey: ["admin", "reports", status],
    queryFn: () => unwrap(api.admin.reports.$get({ query: { status } })),
  });

export type FeedItem = Awaited<
  ReturnType<NonNullable<ReturnType<typeof feedQuery>["queryFn"]>>
>["items"][number];
export type CommentItem = Awaited<
  ReturnType<NonNullable<ReturnType<typeof commentsQuery>["queryFn"]>>
>["comments"][number];
export type NotificationItem = Awaited<
  ReturnType<NonNullable<(typeof notificationsQuery)["queryFn"]>>
>["notifications"][number];

export const userStatsQuery = (username: string) =>
  queryOptions({
    queryKey: ["stats", "user", username.toLowerCase()],
    queryFn: () => unwrap(api.users[":username"].stats.$get({ param: { username } })),
  });

export const globalStatsQuery = queryOptions({
  queryKey: ["stats", "global"],
  queryFn: () => unwrap(api.stats.global.$get()),
  staleTime: 5 * 60_000,
});

export const compareQuery = (a: string, b: string) =>
  queryOptions({
    queryKey: ["stats", "compare", a.toLowerCase(), b.toLowerCase()],
    queryFn: () => unwrap(api.stats.compare.$get({ query: { a, b } })),
  });

export const wrappedYearsQuery = (username: string) =>
  queryOptions({
    queryKey: ["wrapped", username.toLowerCase(), "years"],
    queryFn: () => unwrap(api.users[":username"].wrapped.$get({ param: { username } })),
  });

export const wrappedQuery = (username: string, year: number) =>
  queryOptions({
    queryKey: ["wrapped", username.toLowerCase(), year],
    queryFn: () =>
      unwrap(
        api.users[":username"].wrapped[":year"].$get({ param: { username, year: String(year) } }),
      ),
  });

export const chatThreadsQuery = queryOptions({
  queryKey: ["ai", "threads"],
  queryFn: () => unwrap(api.ai.threads.$get()),
});

export const chatThreadQuery = (id: string) =>
  queryOptions({
    queryKey: ["ai", "thread", id],
    queryFn: () => unwrap(api.ai.threads[":id"].$get({ param: { id } })),
    retry: false,
  });

export const aiUsageQuery = queryOptions({
  queryKey: ["ai", "usage"],
  queryFn: () => unwrap(api.ai.usage.$get()),
});
