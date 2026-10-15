# Polyledger

Inventory, production and waste system for a plastic factory.
Tracks every gram of plastic from raw material to dispatch.

## Stack

- apps/api: NestJS + @nestjs/cqrs, PostgreSQL, Prisma ORM, BullMQ + Redis
- apps/tablet: Expo (React Native, Android) + expo-sqlite with our own
  small sync, offline-first. Not WatermelonDB: 0.28 doesn't build
  on the New Architecture that React Native 0.82+ requires, or under pnpm,
  without patches; our sync is simple (pull is read-only, tablets only
  create records).
- apps/office: React + Vite, React Router, TanStack Query, Tailwind +
  shadcn/ui, react-hook-form + zod, openapi-fetch
- packages/shared: shared types and helpers
- pnpm workspaces, Docker for Postgres and Redis

## Commands

- pnpm db:up / pnpm db:down
- pnpm dev (shared, API and office) / pnpm dev:api / pnpm dev:office
- pnpm dev:tablet (Metro) / pnpm --filter @polyledger/tablet android
  (builds and installs on a device or emulator; set EXPO_PUBLIC_API_URL
  as in apps/tablet/.env.example)
- pnpm db:seed:demo (demo data for an empty dev database; needs
  NODE_ENV=development and DEMO_PASSWORD in apps/api/.env)
- pnpm api:client (regenerates apps/api/openapi.json and the office and
  tablet clients)
- pnpm lint / pnpm typecheck / pnpm format:check
- pnpm --filter api test
- pnpm --filter api exec prisma migrate dev --name <change>
- pnpm --filter api exec prisma migrate deploy
- pnpm --filter api exec prisma generate

## Git

- Never run git commit, git push, or any command that rewrites history.
- When work is ready, stop and show a summary of changed files and a
  suggested commit message. The developer commits manually.

## Domain rules (never break these)

- Weights are integer grams. No floats for quantities, ever.
- stock_ledger is append-only. No UPDATE or DELETE. Fix mistakes with a
  reversal entry.
- Stock checks and reservations read live data inside a transaction with
  SELECT ... FOR UPDATE. Never from a read model or cache.
- Stock checks and reservations use $queryRaw with SELECT ... FOR UPDATE
  inside an interactive transaction. Tagged template only, never
  $queryRawUnsafe.
- Quantity columns are Int (grams). Totals are summed in SQL as bigint and
  converted with a safe-integer check.
- Every write goes through a command handler. Every command accepts an
  idempotency key.
- Events are written to the outbox table in the same transaction. Never
  publish only to the in-memory EventBus.
- Tablets create records only. They never edit stock.
- Item codes never change after creation: stock_balances keeps a copy of
  each item's code to sort and search by.
- Store all times in UTC.

## Architecture

- Modular monolith. Modules talk through commands, queries and events only.
  A module never imports another module's tables or repositories.
- Module layout: commands/, queries/, events/, domain/, infra/, \*.controller.ts
- Business logic lives in domain/ and handlers. Controllers stay thin.

## Code style

Write code the way an experienced engineer on a small team would.

- Clear names over comments. Name things after the factory domain:
  mould, shot, runner, regrind, job card, issue slip.
- Comments only explain _why_, never _what_. No comment on obvious code.
- No banner comments, no section dividers, no emoji, no "Step 1:" comments.
- No over-explaining docstrings on simple functions.
- Small functions, early returns, no deep nesting.
- No unused code, no speculative abstractions, no "for future use" params.
- No TODO placeholders in finished work. Either do it or say so in chat.
- Match the existing style in the file you're editing.
- Prefer boring, standard solutions over clever ones.
- Error messages are short and specific: "Not enough stock for RM-PP-01".

## Security

- Validate all input at the edge (zod or class-validator DTOs).
- Parameterised queries only. Never build SQL with string concatenation.
- Never log secrets, tokens, passwords or full request bodies.
- Every endpoint has an explicit role guard. Deny by default.
- Never read, print or edit .env files. Use .env.example for new variables.
- Rate-limit auth and sync endpoints.
- No new dependency without saying why, and prefer well-maintained ones.

## Office app

- Call the API only through `api` in apps/office/src/api/client.ts. Its
  types come from apps/api/openapi.json: after changing an endpoint, run
  pnpm api:client and commit both generated files. CI checks both.
- Every endpoint a screen reads needs an @ApiOkResponse zod schema in the
  API, and its e2e test parses a real response with that schema.
- The office reaches the API under /api (the Vite proxy in development, the
  reverse proxy in production). The refresh cookie is scoped to /api/auth.
- Tokens never go in localStorage or sessionStorage. The access token lives
  in memory; the refresh token is an httpOnly cookie the page never reads.
- All text on screen comes from src/i18n/en.ts, so Bangla can be added.
- Weights, money and dates only through src/lib/format.ts: kg with three
  decimals, ৳ with lakh grouping, timestamps in Asia/Dhaka.
- Show the API's error message to the user (unwrap + ErrorMessage).
- Every write sends an Idempotency-Key from useWrite. A create form keeps
  its key until it leaves; a form that stays open renews it after saving.
- Component tests fake the API with MSW and never reach the network: the
  server starts in src/test/setup.ts before any module creates the client.
- /docs (Swagger UI) runs only with NODE_ENV=development.

## Tablet app

- Call the API only through createApi in apps/tablet/src/api/client.ts,
  typed from apps/api/openapi.json (pnpm api:client regenerates it).
- Every local write goes through db.write: one at a time, all or nothing.
  Table and column names in SQL come from constants; values are bound.
- Pull only fills the floor's lists; push sends only created production
  and waste entries. A refused record is kept for "Needs supervisor".
- The device token lives only in expo-secure-store and in memory.
- All text comes from src/i18n/bn.ts and en.ts; Bangla is the default.
  Numbers and times only through src/lib/format.ts (Latin digits with
  lakh grouping, times in Asia/Dhaka).
- Touch targets at least 56 dp (TOUCH in src/ui/theme.ts).
- Tests run on Node's SQLite and a fake fetch (src/test/), never the
  network.

## Testing

- Anything touching stock needs tests before it's considered done:
  ledger sum equals balance, concurrent issue cannot overdraw,
  duplicate command is recorded once.
- Integration tests run against real Postgres (Testcontainers), not mocks.

## Working style

- Work one step at a time. Before large changes, explain the plan briefly
  and wait for approval.
- If something is unclear about the factory process, ask. Don't guess.
