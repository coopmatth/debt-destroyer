# Debt Destroyer — Architecture

## Project structure

```
debt-destroyer/
├── app/
│   ├── layout.tsx                Root layout
│   ├── page.tsx                  Marketing / entry page
│   ├── globals.css               Tailwind v4 entry + design tokens
│   ├── (auth)/
│   │   └── login/                Supabase auth (magic link / OAuth)
│   ├── (dashboard)/
│   │   ├── dashboard/            Weekly Strike, safe-to-spend breakdown   [Phase 4]
│   │   ├── debts/                Avalanche/snowball ranking table         [Phase 4]
│   │   ├── expenses/             Fixed expense CRUD + budget knobs        [Phase 4]
│   │   └── settings/             Strategy toggle, payday, linked banks    [Phase 4]
│   └── api/
│       ├── plaid/
│       │   ├── create-link-token/       POST → link_token for Plaid Link  [Phase 2]
│       │   ├── exchange-public-token/   POST → access_token, encrypt+store[Phase 2]
│       │   ├── sync/                    POST → balances + transactions/sync [Phase 2]
│       │   └── webhook/                 POST ← Plaid item/txn webhooks    [Phase 2]
│       ├── debts/                        Manual debt CRUD (RLS-scoped)     [Phase 2]
│       ├── expenses/                     Manual bill CRUD (RLS-scoped)     [Phase 2]
│       ├── engine/
│       │   └── weekly-plan/             GET  → compute + persist a strike [Phase 3]
│       └── cron/
│           └── weekly-refresh/          Vercel Cron: sync all, recompute  [Phase 3]
├── lib/
│   ├── plaid/         client.ts, link.ts, accounts.ts, transactions.ts, mappers.ts  [Phase 2]
│   ├── validation/    debts.ts, expenses.ts — zod schemas shared by API and forms
│   ├── money.ts       cents ↔ dollars, currency formatting
│   ├── supabase/      client.ts (browser), server.ts (RSC/route), admin.ts (service role)
│   ├── engine/        cashflow.ts, strategy.ts, types.ts                  [Phase 3]
│   └── crypto/        tokens.ts — AES-256-GCM encrypt/decrypt of access tokens [Phase 2]
├── components/        ui/ (primitives), plaid/ (Link button), dashboard/ (cards)
├── supabase/migrations/
│   ├── 0001_initial_schema.sql
│   ├── 0002_rls_policies.sql
│   └── 0003_manual_debt_tracking.sql
├── types/             database.types.ts (generated), domain.ts
├── tests/             engine unit tests                                   [Phase 3]
└── vercel.json        Weekly cron + function duration overrides
```

## Data flow

```
Plaid Link (browser)
   │  public_token
   ▼
/api/plaid/exchange-public-token ──► Plaid /item/public_token/exchange
   │                                        │ access_token
   │                                        ▼
   │                                 AES-256-GCM encrypt (lib/crypto)
   │                                        ▼
   └──────────────────────────────► plaid_items.access_token_encrypted

Vercel Cron (weekly) / Plaid webhook
   ▼
/api/plaid/sync ──► /accounts/balance/get   → accounts.current_balance_cents
                ──► /transactions/sync      → transactions (cursor on plaid_items)

User (dashboard forms)
   ▼
/api/debts, /api/expenses ──► debts.apr, minimum_payment_cents, next_due_date
                          ──► expenses.amount_cents, frequency, next_due_date
   ▼
Cash Flow Engine (lib/engine, pure functions — no I/O)
   liquid cash − (fixed due before payday + variable budget + minimums + floor)
   ▼
debt_strikes  (one row per user per week, with full breakdown)
   ▼
Dashboard (RSC reads via RLS-scoped Supabase client)
```

## Key decisions

**Supabase JS client over Prisma.** Prisma would mean a second source of schema
truth and a connection pooler in front of serverless functions. The Supabase
client speaks PostgREST over HTTP (no pool to exhaust on Vercel), and — this is
the deciding factor — it forwards the user's JWT, so RLS enforces ownership on
every query. With Prisma you connect as a superuser and RLS never applies, which
puts every access check back in application code. Schema stays in versioned SQL
migrations; `npm run db:types` generates the TypeScript.

**Money as integer cents everywhere.** JS floats cannot represent 0.1 exactly;
summing dollar floats across a few dozen transactions accumulates error into a
number we tell someone to pay a bank. Cents are integers up to ~$90T. Conversion
lives in `lib/money.ts` and happens only at the edges: values arriving from
Plaid, and values typed into or rendered on a form.

**The engine is pure.** `lib/engine` takes plain data in and returns a plan out —
no database calls, no `new Date()` inside the math (the clock is an argument).
That is what makes the algorithm unit-testable against fixtures, which matters
for code that tells people to move real money.

**Every strike is persisted with its inputs.** `debt_strikes` stores liquid cash,
each expense bucket, the reserved minimums, and a JSONB breakdown. The dashboard
can then answer "why is it $180 this week and not $400?" from stored data, and a
recompute is idempotent per `(user_id, week_start)`.

**Access tokens encrypted at rest.** A Plaid access token is a durable read
credential on someone's bank account. It is encrypted in the app layer before it
reaches Postgres, and column-level GRANTs keep the ciphertext column out of
reach of client roles entirely (RLS filters rows, not columns).

> Consequence for Phase 2 client code: `from("plaid_items").select("*")` fails
> with `permission denied` for a logged-in user, by design. Always name the
> columns. Only the service-role client can read the token column.

**Server-authoritative writes.** Clients own their debts and bills — that is the
whole input side now. They still cannot write account balances (Plaid-synced) or
the recommended strike amount (engine-computed): those have no client
INSERT/UPDATE policy, so the service role is the only writer.

## Build phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | SQL schema, RLS, project scaffold | done |
| 2 | Plaid (balances + transactions), manual debt/bill entry | done |
| 3 | Cash Flow Engine + avalanche/snowball algorithm | pending approval |
| 4 | Dashboard components | pending |

## Phase 2 notes

**Plaid scope: depository only.** Plaid links bank accounts for balances and
transactions. Debts and bills are entered by hand, so Liabilities is not
requested and no product approval is needed for it. The liability mapping code
(including balance-weighted APR blending across a card's several rates) was
removed in the manual-entry change and is recoverable from git history if a card
is ever linked directly.

**Manual entry is server-validated, RLS-enforced.** `/api/debts` and
`/api/expenses` use the request-scoped client carrying the user's JWT, not the
service role — so ownership is enforced by Postgres, and a forgotten filter
returns nothing rather than everything. Zod schemas in `lib/validation` are
shared with the Phase 4 forms so the rules are stated once. Debts are soft
deleted (`is_active = false`) because past strikes reference them.

**Cursor safety.** `/transactions/sync` writes its cursor only after the rows
land. Advancing it first means a failed insert skips those transactions
permanently and silently. Mid-pagination mutations
(`TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`) discard the accumulated batch
and restart from the original cursor.

**Transfers excluded from spend.** `LOAN_PAYMENTS`, `TRANSFER_IN`, and
`TRANSFER_OUT` are flagged `is_transfer`. Counting a $600 card payment as a
living expense would shrink next week's recommendation by $600 — the engine
would punish the user for following its own advice.

**Webhook verification.** The endpoint is a public URL that triggers bank syncs,
so every request is verified: ES256 JWT against Plaid's published key, plus a
SHA-256 match on the exact raw body, plus an `iat` freshness bound. Parse JSON
only after that passes.

**Minimum payments expire on their own.** `min_payment_met_for_cycle` was a
boolean, safe only while a nightly liabilities sync overwrote it. With manual
entry it became a latch: ticked in August, still true in September, and the
engine would route the strike past a real unpaid minimum. Migration 0003
replaces it with `min_payment_paid_for_due_date` — the due date the payment was
made *for*. The engine compares it to the current `next_due_date`, so a stale
value fails closed.

## Setup

```bash
npm install
cp .env.example .env.local          # fill in Supabase + Plaid credentials
npx supabase link --project-ref <ref>
npm run db:push                     # applies both migrations
npm run db:types                    # generates types/database.types.ts
npm run dev
```

Plaid environments are **sandbox** and **production** — `development` was retired
in 2024. Only the Transactions product is requested; debts and bills are entered
by hand, so no Liabilities approval is needed.
