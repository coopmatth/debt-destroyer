# Debt Destroyer — Architecture

## Project structure

```
debt-destroyer/
├── app/
│   ├── layout.tsx                Root layout
│   ├── page.tsx                  Marketing / entry page
│   ├── globals.css               Tailwind v4 entry + design tokens
│   ├── (auth)/
│   │   └── login/                Magic-link sign in                      [Phase 4]
│   ├── auth/callback/            Code exchange → session                 [Phase 4]
│   ├── (dashboard)/
│   │   ├── dashboard/            Weekly Strike, allocation, ledger        [Phase 4]
│   │   ├── debts/                Debt entry + payoff order                [Phase 4]
│   │   ├── expenses/             Bill entry, mark paid                    [Phase 4]
│   │   └── settings/             Strategy, budget, payday, linked banks   [Phase 4]
│   └── api/
│       ├── plaid/
│       │   ├── create-link-token/       POST → link_token for Plaid Link  [Phase 2]
│       │   ├── exchange-public-token/   POST → access_token, encrypt+store[Phase 2]
│       │   ├── sync/                    POST → balances + transactions/sync [Phase 2]
│       │   └── webhook/                 POST ← Plaid item/txn webhooks    [Phase 2]
│       ├── debts/                        Manual debt CRUD (RLS-scoped)     [Phase 2]
│       ├── expenses/                     Manual bill CRUD (RLS-scoped)     [Phase 2]
│       ├── settings/                      PATCH the engine's knobs          [Phase 4]
│       ├── ai/
│       │   ├── discover-bills/            POST → recurring bills to approve
│       │   └── reality-check/             POST → a lower, safer strike
│       ├── engine/
│       │   └── weekly-plan/             GET compute · POST persist        [Phase 3]
│       ├── strikes/[id]/                PATCH accept/skip/paid            [Phase 3]
│       └── cron/
│           └── weekly-refresh/          Vercel Cron: sync all, recompute  [Phase 3]
├── lib/
│   ├── plaid/         client.ts, link.ts, accounts.ts, transactions.ts, mappers.ts  [Phase 2]
│   ├── ai/            client.ts (Gemini) · recurring.ts · volatility.ts
│   │                  discover-bills.ts · reality-check.ts
│   ├── validation/    debts.ts, expenses.ts — zod schemas shared by API and forms
│   ├── money.ts       cents ↔ dollars, currency formatting
│   ├── supabase/      client.ts (browser), server.ts (RSC/route), admin.ts (service role)
│   ├── engine/        dates.ts, cashflow.ts, strategy.ts, index.ts, loader.ts [Phase 3]
│   └── crypto/        tokens.ts — AES-256-GCM encrypt/decrypt of access tokens [Phase 2]
├── components/        ui/ · dashboard/ · debts/ · expenses/ · settings/ · plaid/
├── middleware.ts      Session refresh + dashboard gate
├── supabase/migrations/
│   ├── 0001_initial_schema.sql
│   ├── 0002_rls_policies.sql
│   ├── 0003_manual_debt_tracking.sql
│   └── 0004_expense_payment_tracking.sql
├── types/             database.types.ts (generated from the migrations)
├── tests/             money · mappers · validation · crypto · engine
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
| 3 | Cash Flow Engine + avalanche/snowball algorithm | done |
| 4 | Dashboard components | done |

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

## Phase 3 notes

**The clock is an argument.** `computeWeeklyPlan(input, { now })` — nothing in
`lib/engine` calls `new Date()`. That is what turns "what does this recommend on
the Friday before a Tuesday payday" into a test rather than a thought
experiment, and it is why the engine is a pure function with the database work
pushed out to `loader.ts`.

**Dates are strings, and arithmetic is UTC.** Due dates and paydays are calendar
facts, not instants. Doing this math on local `Date` objects means a bill due
March 9 can become March 8 for a user whose timezone shifts for DST that
weekend, and the engine reserves it a day early. `todayInTimezone` is the one
place a real zone is consulted — for the user's own calendar date, so their week
does not roll over at 5pm Sunday.

**Multiple occurrences per window.** A weekly bill genuinely lands twice before
a fortnightly payday. `occurrencesInWindow` returns every occurrence, because
one-charge-per-bill would under-reserve exactly the users living closest to the
line.

**The seven-day grace window.** Hand-maintained due dates go stale: rent is paid
on the 1st but `next_due_date` still reads the 1st. Reserving it for the rest of
the month would make every recommendation too small, all month. Past the grace
window a charge is dropped from the math and raised as a blocker instead, so it
gets attention rather than silently skewing the number. `expenses.last_paid_date`
(migration 0004) is the precise fix; the grace window bounds the damage when
nobody marks anything.

**Variable budget nets out what is already spent.** Money spent on Tuesday has
already left the account, so it is visible in the liquid balance. Reserving the
full weekly budget on top of that charges the user twice for the same groceries.
`variableRemaining = max(0, budget − spentThisWeek)`.

**The strike rounds down, never up.** Rounding up would recommend money the
buffer does not cover.

**Allocation cascades and respects headroom.** If the top-ranked card has $40
left and the buffer is $300, the remainder rolls to the next debt in rank order
rather than overpaying by $260. Headroom is balance minus any minimum already
reserved on that same debt — without that subtraction a $50 balance with a $35
minimum would be told to pay $85.

**Overdue minimums outrank the strike.** A missed $35 minimum draws roughly a
$40 late fee and can trigger a penalty APR, which outruns anything the avalanche
saves that week. They become their own actions ahead of the strike; the cash was
already reserved, so they are not subtracted twice.

**Ties break deterministically.** Two cards at the same APR resolve by balance,
then by id. Without a total order the target could flip between runs and the
user would see the recommendation move for no visible reason.

**Marking a strike paid is the only engine write to `debts`.** It reduces the
balance (clamped at zero), rolls `next_due_date` forward a cycle, and records
the minimum as paid for the cycle just closed — so the weekly loop is two taps
rather than retyping balances. It refuses to apply twice.

## Phase 4 notes

**One hero figure per view.** The weekly strike, at display size, in the same
sans as everything else and with proportional figures — `tabular-nums` gives
every digit the width of a zero, which makes a large number look loose. Tabular
figures are reserved for columns that must align.

**The allocation bar is a partition, not a ranking.** Liquid cash divides into
strike, bills, spending money, minimums, and floor; the parts sum to the whole,
which is what makes a stacked bar the honest form. Colour is assigned by bucket
identity in fixed slot order and never moves — the strike stays slot 1 whether
it is the largest slice or absent. Palette validated in both modes: worst
adjacent CVD ΔE 9.1 light / 8.4 dark, worst normal-vision ΔE 19.6 / 19.3.

**Relief for the light-mode contrast warning.** Three light slots sit below 3:1
against the surface, so nothing depends on colour alone: every bucket is named
with its exact amount in the legend, and the ledger repeats all of it as text.

**The payoff bar encodes the ranking key.** APR under avalanche, balance under
snowball, so bar length always descends with rank. Encoding anything else breaks
that — balance while ranking by APR puts the target at the top with the shortest
bar, and annual interest cost is no better, since it scales with balance and
lets a large low-rate loan outrun a small high-rate card ranked above it. Yearly
carrying cost still appears as text on each row.

**Status colour never carries meaning alone.** Blockers and paid/overdue badges
pair the colour with a glyph and a written label, which is the mitigation the
status palette requires on a light surface.

**The dashboard computes server-side.** The page calls the engine directly
rather than fetching its own API over HTTP — one less round trip, and no way for
the page and the route to disagree about the week's number.

**Verified by rendering.** The dashboard was built with fixture data and
screenshotted at 1280px light, 1280px dark, and 390px mobile: no horizontal
overflow, no label collisions, and dark mode re-stepped rather than flipped.

## The AI advisory layer

Optional throughout. With no `GOOGLE_GENERATIVE_AI_API_KEY` the routes return
503 and the rest of the app is unchanged — the deterministic engine decides
everything that matters, and the advisor is garnish on top of maths that works
without it.

**Arithmetic here, judgment there.** `recurring.ts` and `volatility.ts` compute
every figure: merchant grouping, median amounts, intervals, cadence, next due
dates, standard deviation, coefficient of variation, how many days of typical
spending the cash floor covers. The model is asked only the questions a
calculation cannot answer — is this repetition an obligation or a habit, and
how much caution does this week deserve. It never emits money. A hallucinated
$180 where the real charge is $18 would become a reserved bill and quietly
distort every recommendation until someone noticed.

**The advisor can only reduce.** `applyHoldback` takes the model's judgment as
a percentage and does the multiplication, holding two invariants regardless of
what comes back: the result never exceeds the deterministic strike, and rounding
is always downward so it cannot creep back over the ceiling. A model returning
999 or -50 cannot produce an unsafe number.

**Stale advice is inert.** The dashboard prefers the AI figure only when it is
lower. Advice computed on Monday against a larger surplus is simply ignored on
Wednesday rather than acted on, which is also why no cross-column CHECK enforces
the relationship in the database — see migration 0005.

**Both plans are recomputed server-side.** Neither AI route accepts a WeeklyPlan
from the request body. Both write to `debt_strikes`, and a plan supplied by the
caller is a number the caller chose — accepting one would reopen the forgery
path migration 0005 closed.

**Model selection auto-updates.** `gemini-flash-latest` tracks the current Flash
release without a redeploy; `withModelFallback` retries once on a pinned
`gemini-2.5-flash` if the alias resolves somewhere the API key cannot reach, so
an upstream release cannot take the feature down. Free-tier quota is not
exposed by any API, so "newest" is the closest discoverable proxy for "most
generous" — set `GEMINI_MODEL` to pin a specific id when that trade is wrong.

**The weekly cron runs the advisor last, on a clock.** Syncing balances and
recomputing the strike is what the app needs to be correct; the advisory pass is
a nicety. Past a 40s budget the run stops starting AI calls, so a slow model
costs the nicety and never the necessity. An advisory failure is caught per
user and never fails the run — the deterministic strike is already stored, and
the dashboard shows it unadjusted.
