# Debt Destroyer

Syncs live bank data, reads your real weekly cash flow, and calculates the exact
amount of extra cash you can safely throw at debt this week — routed by the Debt
Avalanche method (highest APR first), with a Snowball toggle.

- **Frontend:** Next.js (App Router) + Tailwind CSS, deployed on Vercel
- **Backend:** Supabase (PostgreSQL) with RLS, `@supabase/supabase-js`
- **Bank data:** Plaid — bank balances and transactions (debts and bills are entered by hand)

## How the number is calculated

```
Safe to Spend = Total Liquid Cash
              − Fixed Expenses due before next payday
              − Variable Living Expenses (weekly budget)
              − Unpaid minimum payments this cycle
              − Personal cash floor

Weekly Debt Strike = max(Safe to Spend, 0)
Target             = highest APR (avalanche) or lowest balance (snowball)
```

Minimums on every debt are reserved before a single dollar is routed anywhere —
an avalanche that misses a minimum payment costs more in late fees than it saves
in interest.

## Getting started

- **Self-hosting on Linux, reached from a phone over Tailscale:**
  [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md) — the full step-by-step.
- **How it is built:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — project
  layout, data flow, and the reasoning behind the schema and the algorithm.
