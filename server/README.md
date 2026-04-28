# My Games V3 Backend

The My Games V3 API built with Hono, Bun, and MongoDB. It powers the frontend's game library, auth, profile, screenshots, Steam sync, activity, notifications, statistics, and import/export flows.

## Technology

- Bun
- Hono
- TypeScript
- MongoDB and Mongoose
- Zod and `@hono/zod-validator`
- Scalar OpenAPI reference
- Cloudflare R2-compatible object storage
- Nodemailer
- Vitest

## Setup

```bash
bun install
```

Start local MongoDB:

```bash
bun run docker:mongo:up
```

Create the environment file:

```bash
cp .env.example .env
```

Minimum local MongoDB setting:

```env
MONGO_URL=mongodb://localhost:27017/my-games
```

## Running

```bash
bun run dev
```

Services:

- API: `http://localhost:3030`
- Scalar Docs: `http://localhost:3030/scalar`
- OpenAPI JSON: `http://localhost:3030/openapi.json`

Stop MongoDB:

```bash
bun run docker:mongo:down
```

## Scripts

```bash
bun run dev
bun run dev:cloudflare
bun run start
bun run docker:mongo:up
bun run docker:mongo:down
bun run test
bun run test:run
bun run test:coverage
bun run format
```

## Architecture

```txt
src/
  config/       env, database, and storage configuration
  docs/         OpenAPI spec
  lib/          response, error, jwt, email, and upload helpers
  middlewares/  auth and ownership checks
  models/       Mongoose models
  repository/   Mongo queries and mapping helpers
  routes/       Hono route definitions
  schemas/      Zod request validation
  services/     business rules, orchestration, and side effects
  types/        context and API contract types
```

## Layering Rules

The request flow follows this order:

1. Route
2. Zod schema validation
3. Auth or ownership middleware
4. Service
5. Repository
6. Model
7. `ok(...)` response or `AppError`

Routes stay thin. Business rules, Mongo queries, notifications, activity logs, and storage cleanup do not belong in routes. Those behaviors live in services. The repository layer owns Mongoose queries, aggregation, population, and mapping.

## Domain Notes

- `Game`: the catalog game record.
- `LibraryEntry`: the user's relationship with a game; platform, status, rating, review, play time, favorite state, and completion dates live here.
- Screenshots, activities, notifications, statistics, and Steam sync data must be linked to the correct ownership level.

## Response And Error Standard

- Successful responses return through `ok(data, message?)`.
- Expected domain errors are thrown as `AppError(code, message, status, details?)`.
- The global error handler converts `AppError` values to the `fail(...)` response format.
- Routes should not create custom error JSON.

## API Docs

Endpoint changes should be reflected in the OpenAPI document in `src/docs/openapi.ts`. If a response shape used by the frontend changes, update `packages/shared`, frontend API types, and the relevant TanStack Query cache updates together.

## Testing

```bash
bun run test:run
```

Business rules and side effects should be tested at the service level. Update test coverage when changing auth or ownership behavior, game add/edit/delete flows, Steam sync, import/export, screenshot cleanup, notifications, or activity behavior.
