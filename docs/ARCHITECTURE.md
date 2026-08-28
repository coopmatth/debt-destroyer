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
│       │   ├── sync/                    POST → /transactions/sync + liabilities [Phase 2]
│       │   └── webhook/                 POST ← Plaid item/txn webhooks    [Phase 2]
│       ├── engine/
│       │   └── weekly-plan/             GET  → compute + persist a strike [Phase 3]
│       └── cron/
│           └── weekly-refresh/          Vercel Cron: sync all, recompute  [Phase 3]
├── lib/
│   ├── plaid/         client.ts, link.ts, liabilities.ts, transactions.ts, mappers.ts  [Phase 2]
│   ├── supabase/      client.ts (browser), server.ts (RSC/route), admin.ts (service role)
│   ├── engine/        money.ts, cashflow.ts, strategy.ts, types.ts       [Phase 3]
│   └── crypto/        tokens.ts — AES-256-GCM encrypt/decrypt of access tokens [Phase 2]
├── components/        ui/ (primitives), plaid/ (Link button), dashboard/ (cards)
├── supabase/migrations/
│   ├── 0001_initial_schema.sql
│   └── 0002_rls_policies.sql
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
                ──► /liabilities/get        → debts.apr, minimum_payment, next_due_date
                ──► /transactions/sync      → transactions (cursor on plaid_items)
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
happens once, at the Plaid boundary.

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

**Server-authoritative writes.** Clients can edit expenses and manually-added
debts. They cannot write account balances, synced debt APRs, or the recommended
strike amount — those tables have no client INSERT/UPDATE policy, so the service
role is the only writer.

## Build phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | SQL schema, RLS, project scaffold | this commit |
| 2 | Plaid utilities: token exchange, liabilities, transactions | pending approval |
| 3 | Cash Flow Engine + avalanche/snowball algorithm | pending |
| 4 | Dashboard components | pending |

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
in 2024. Liabilities requires product access approval on a production account, so
request it before you plan around live APRs.
