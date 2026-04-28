---
name: my-games-frontend-architecture
description: Use this skill whenever changing the My Games V3 frontend in client/. It preserves the React, TanStack Query, TanStack Router, Zustand, shared-contract, API-hook-component architecture, with special attention to cache updates after mutations so the UI reflects server changes immediately.
---

# My Games Frontend Architecture

## Purpose

Use this skill for every change under `client/`. The goal is to keep frontend work aligned with the existing architecture and to prevent the most common product bug in this app: data changes on the server, but the visible UI does not update because TanStack Query cache ownership was bypassed or incompletely refreshed.

## Architectural Boundaries

- `src/routes/`: route-level composition, loaders/navigation, page orchestration.
- `src/components/`: presentational and workflow UI. Components should not call `fetch` directly.
- `src/hooks/`: feature hooks that bind TanStack Query mutations/queries to app behavior.
- `src/api/`: typed API wrappers using `apiFetch`.
- `src/api/queryKeys.ts`: the only home for query key factories.
- `src/store/`: Zustand for client-only state such as auth, UI, sync wizard state, modal state, and local preferences.
- `packages/shared`: cross-app contracts and domain types. Prefer shared types over duplicated local shapes.

When adding a feature, follow the path:

1. Shared type or API response shape.
2. API function in `src/api/*.api.ts`.
3. Query key in `src/api/queryKeys.ts`.
4. Query/mutation hook in `src/hooks/use*.ts`.
5. Route/component consumption.

## Server State Rule

TanStack Query owns server state. Zustand does not own server collections, fetched records, derived counts, activities, screenshots, notifications, or profile data that comes from the API.

Use Zustand only when the data is truly client state:

- Auth token and currently persisted auth user.
- UI state that has no server source.
- Temporary import/sync/modal state.
- Optimistic UI helpers that are reconciled with Query cache.

Do not copy a query result into Zustand just to render it elsewhere. Instead, add a query key and reuse the query hook.

## Mutation Cache Contract

Every mutation must explicitly answer: "Which visible query results became stale or changed?"

After a successful mutation:

- Update exact detail caches with `queryClient.setQueryData` when the API returns the changed entity.
- Update currently visible list or infinite-query caches when the changed entity is shown there.
- Invalidate broader related keys after direct cache updates so background data becomes consistent.
- Remove deleted detail caches with `removeQueries` when a record is deleted.
- Invalidate dependent surfaces such as statistics, activity feed, notifications, profile, favorite sections, screenshot counts, and Steam sync state when the mutation can affect them.
- Keep toast/navigation side effects separate from cache correctness.

For infinite queries, update pages in place:

```ts
queryClient.setQueriesData(
  { queryKey: gameKeys.all },
  (old: InfiniteData<GamesPageResponse> | undefined) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        items: page.items.map((item) =>
          item._id === updated._id ? { ...item, ...updated } : item,
        ),
      })),
    };
  },
);
```

If the item might enter or leave a filtered list, do both:

- Patch obvious visible caches when possible.
- Invalidate the relevant list key family so filter membership is recalculated by the server.

For optimistic updates, use `onMutate`, cancel affected queries, snapshot previous data, patch cache, rollback in `onError`, and invalidate in `onSettled`.

## Query Key Rules

- Add key factories only in `src/api/queryKeys.ts`.
- Include every variable that affects the API response in the key.
- Keep key shapes stable; avoid passing newly shaped objects with empty or irrelevant fields.
- Use feature roots such as `gameKeys.all`, `screenshotKeys.all`, and `notificationKeys.all` for broad invalidation.
- Prefer exact keys for detail writes and broader roots for list invalidation.

## API And Contract Rules

- All HTTP calls go through `apiFetch`; do not inline `fetch` in components or hooks.
- API wrappers return unwrapped `data`, matching the app's `ApiSuccess<T>` convention.
- Use `isApiError` for user-facing error messages.
- Keep request and response types close to API wrappers unless they are cross-app contracts; shared contracts belong in `packages/shared`.
- When backend response shape changes, update shared types, frontend API types, query cache update logic, and affected tests in the same change.

## Component Rules

- Route files compose data hooks and page structure.
- Components receive typed props and emit intent callbacks.
- Forms own draft input state; submitted results flow through mutation hooks.
- Modals can manage visibility and draft state, but not server truth.
- Reusable UI primitives stay in `src/components/ui`.

## Verification Checklist

Before finishing frontend work:

- Run the narrowest relevant test or build command available.
- Confirm each mutation has cache patching or invalidation for every affected visible surface.
- Confirm no component made direct HTTP calls.
- Confirm no server-owned collection was moved into Zustand.
- For add/edit/delete/favorite/status/screenshot/notification mutations, verify the UI changes without manual refresh.
