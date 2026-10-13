# Polyledger

Inventory, production and waste system for a plastic factory.
Tracks every gram of plastic from raw material to dispatch.

## Stack

- apps/api: NestJS + @nestjs/cqrs, PostgreSQL, Drizzle ORM, BullMQ + Redis
- apps/tablet: React Native (Android) + WatermelonDB, offline-first
- apps/office: React (Vite)
- packages/shared: shared types and helpers
- pnpm workspaces, Docker for Postgres and Redis

## Commands

- pnpm db:up / pnpm db:down
- pnpm dev:api
- pnpm --filter api test
- pnpm --filter api drizzle-kit generate

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
- Every write goes through a command handler. Every command accepts an
  idempotency key.
- Events are written to the outbox table in the same transaction. Never
  publish only to the in-memory EventBus.
- Tablets create records only. They never edit stock.
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

## Testing

- Anything touching stock needs tests before it's considered done:
  ledger sum equals balance, concurrent issue cannot overdraw,
  duplicate command is recorded once.
- Integration tests run against real Postgres (Testcontainers), not mocks.

## Working style

- Work one step at a time. Before large changes, explain the plan briefly
  and wait for approval.
- If something is unclear about the factory process, ask. Don't guess.
