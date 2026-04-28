# My Games V3 Frontend

The React client for My Games V3. It contains the game library, profile, Steam sync, screenshots, notifications, activity feed, and import/export interfaces.

## Technology

- React 19
- TypeScript
- Vite
- TanStack Router
- TanStack Query
- Zustand
- React Hook Form
- Zod
- Tailwind CSS
- Framer Motion
- Vitest and Testing Library

## Setup

```bash
yarn install
```

Set the local API URL:

```env
VITE_API_URL=http://localhost:3030
```

## Running

```bash
yarn dev
```

Default URL: `http://localhost:5173`

## Scripts

```bash
yarn dev
yarn dev:cloudflare
yarn build
yarn lint
yarn test
yarn test:run
yarn preview
yarn format
```

## Architecture

```txt
src/
  api/          HTTP client, API functions, query key factories
  components/   UI pieces and feature components
  hooks/        TanStack Query query and mutation hooks
  lib/          shared helpers and query client
  routes/       TanStack Router route files
  store/        client-only state with Zustand
  styles/       global styles
  test/         test setup
```

## State Management Rule

TanStack Query owns server state. Lists, detail records, notifications, activities, statistics, screenshot counts, and profile data returned by the API must not be copied into Zustand.

Zustand is only for client-side state:

- Auth token and the persisted auth user.
- UI preferences and modal or wizard state.
- Temporary import or Steam sync state.
- Short-lived optimistic helper state that will be reconciled with the server.

When a mutation changes data, the related query cache must be updated or invalidated inside that mutation. UI refresh must not depend on a page reload, route change, or accidental refetch.

Mutation checklist:

- Use `setQueryData` for changed detail records.
- Patch visible lists or infinite query pages.
- Invalidate the relevant list key family when filter membership can change.
- Use `removeQueries` for deleted detail records.
- Invalidate dependent surfaces such as statistics, activity, notifications, profile, and screenshot counts.
- Keep rollback snapshots for optimistic updates.

## API Layer

- HTTP requests go through `apiFetch` in `src/api/client.ts`.
- Feature APIs live under `src/api/*.api.ts`.
- Query keys are defined only in `src/api/queryKeys.ts`.
- Cross-app types come from `@my-games/shared`.
- User-facing error messages should use the `isApiError` guard.

## Testing

```bash
yarn test:run
```

When changing UI state or mutation behavior, add or update the relevant hook or component test. Cache behavior is especially important for add, edit, delete, favorite, status, notification, and screenshot mutations.
