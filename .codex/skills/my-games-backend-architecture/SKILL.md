---
name: my-games-backend-architecture
description: Use this skill whenever changing the My Games V3 backend in server/. It preserves the Hono route, Zod schema, middleware, service, repository, Mongoose model, shared-contract architecture and the project rules for validation, ownership, side effects, errors, and API responses.
---

# My Games Backend Architecture

## Purpose

Use this skill for every change under `server/`. The backend should stay layered, predictable, and contract-compatible with the React client and `packages/shared`.

## Request Flow

Follow the existing path:

1. Route in `src/routes/*.routes.ts`.
2. Validation in `src/schemas/*.schema.ts` with `zValidator`.
3. Auth or ownership middleware in `src/middlewares`.
4. Business logic in `src/services`.
5. Persistence logic in `src/repository`.
6. Mongoose documents in `src/models`.
7. Response through `ok(...)` or `AppError`.

Routes stay thin. They parse input, read path/query/auth context, call a service, and return `c.json(ok(data), status?)`.

## Layer Rules

- Routes must not contain business rules, database queries, notification logic, activity logging, or storage cleanup.
- Services own domain behavior, invariants, orchestration, side effects, and cross-repository decisions.
- Repositories own Mongo/Mongoose queries, aggregation, population, and mapping helpers.
- Models define persistence shape only; avoid feature orchestration in models.
- Shared contracts define cross-app API/domain shapes; do not duplicate them casually in client or server.

## Validation And Contracts

- Add or change request validation in `src/schemas`.
- Use `zValidator("json" | "query" | "param", schema)` at the route boundary.
- Keep response shapes stable for the frontend. If a response changes, update `packages/shared`, frontend API types, frontend cache update logic, and tests together.
- Prefer explicit DTO/contract functions when mapping Mongoose documents to client-facing shapes.
- Keep legacy compatibility fields such as game list item aliases only where current UI still depends on them.

## Auth And Ownership

- Use `authMiddleware` for authenticated mutations and private reads.
- Use ownership middleware such as `gameOwnerMiddleware` for library-entry mutations.
- Services should still fail safely if a record is missing or ownership assumptions are invalid.
- Never trust user IDs from request bodies when authenticated context already provides `c.get("userId")`.

## Domain Model Rules

- `Game` is the catalog record.
- `LibraryEntry` is the user's relationship to a game and owns status, platform, rating, review, play time, favorite state, and completion dates.
- Screenshots, activities, notifications, Steam sync data, and statistics must reference the right domain owner.
- When changing a domain concept, check both catalog-level and library-entry-level implications.

## Side Effects

Keep side effects in services and make their reliability explicit:

- Activity logs should reflect meaningful user-visible changes.
- Notifications should be triggered only by the relevant domain event.
- Non-critical notifications can be fire-and-forget with a deliberate `.catch(() => {})`.
- R2/storage cleanup must not leave database state inconsistent.
- Cron jobs should call services, not repositories directly.

## Error And Response Rules

- Throw `AppError(code, message, status, details?)` for expected domain failures.
- Let the global `app.onError` convert `AppError` to `fail(...)`.
- Do not return ad hoc error JSON from individual routes.
- Successful responses use `ok(data, message?)`.
- Keep HTTP statuses meaningful: `201` for creation, `400` for invalid domain input, `401/403` for auth/ownership, `404` for missing resources.

## Data Access Rules

- Put reusable database logic in repositories.
- Prefer `Promise.all` for independent count/list reads.
- Keep pagination explicit with `page`, `limit`, `skip`, `total`, and `totalPages`.
- Be careful with populated documents; use mapping helpers before returning data to the client.
- Avoid leaking raw Mongoose internals in API responses.

## OpenAPI And Documentation

- Public endpoint changes should be reflected in `src/docs/openapi.ts`.
- Environment additions must be added to `src/config/env.ts` and `.env.example`.
- Mention operational changes in `server/README.md` when they affect setup or running the backend.

## Verification Checklist

Before finishing backend work:

- Run the narrowest relevant test or `bun run test:run` when practical.
- Confirm route, schema, service, repository, and shared/frontend contracts are all aligned.
- Confirm ownership and auth are enforced for mutations.
- Confirm expected errors use `AppError`.
- Confirm side effects are intentional and tested when they carry product meaning.
