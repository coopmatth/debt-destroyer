-- =============================================================================
-- Debt Destroyer — initial schema
-- Target: Supabase Postgres 15+
--
-- Conventions used throughout:
--   * All money is stored as BIGINT CENTS, never float/numeric dollars.
--     Plaid returns floats; convert at the API boundary (lib/engine/money.ts).
--     Cents keep every intermediate sum in JS integer-safe territory
--     (2^53 cents ~= $90 trillion) and remove 0.1 + 0.2 rounding bugs.
--   * Every user-owned table carries a denormalized `user_id` so RLS policies
--     are single-column comparisons with no joins or subqueries on hot paths.
--   * Plaid's own identifiers are prefixed `plaid_*` to distinguish them from
--     our internal uuid primary keys (e.g. plaid_items.plaid_item_id is the
--     string Plaid issues; accounts.item_id is our uuid FK).
--   * Timestamps are timestamptz, calendar dates (due dates, paydays) are date.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enumerated types
-- Small, stable value sets. New values are additive: ALTER TYPE ... ADD VALUE.
-- Free-growing sets (spend categories) are plain text instead.
-- -----------------------------------------------------------------------------
create type public.debt_strategy     as enum ('avalanche', 'snowball');
create type public.account_type      as enum ('depository', 'credit', 'loan', 'investment', 'other');
create type public.debt_kind         as enum ('credit_card', 'student_loan', 'mortgage', 'auto_loan', 'personal_loan', 'other');
create type public.expense_frequency as enum ('weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annual', 'one_time');
create type public.pay_frequency     as enum ('weekly', 'biweekly', 'semimonthly', 'monthly');
create type public.expense_source    as enum ('manual', 'plaid_recurring', 'derived');
create type public.item_status       as enum ('good', 'login_required', 'pending_expiration', 'error', 'revoked');
create type public.strike_status     as enum ('recommended', 'accepted', 'skipped', 'paid', 'superseded');

-- -----------------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- users
-- 1:1 with auth.users. Holds strategy choice plus the handful of budgeting
-- knobs the cash-flow engine needs; they are 1:1 with the user, so a separate
-- settings table would only add a join.
-- =============================================================================
create table public.users (
  id                           uuid primary key references auth.users (id) on delete cascade,
  email                        text not null,
  full_name                    text,

  -- Debt Destroyer strategy toggle. Avalanche = highest APR first (default,
  -- mathematically optimal); snowball = lowest balance first.
  preferred_strategy           public.debt_strategy not null default 'avalanche',

  -- Weekly allowance for variable living expenses (groceries, gas, eating out).
  -- Seeded from observed spend during onboarding, then user-adjustable.
  weekly_variable_budget_cents bigint not null default 0
    check (weekly_variable_budget_cents >= 0),

  -- Cash the engine must never recommend spending: a personal floor that sits
  -- underneath the safe-to-spend calculation.
  min_cash_buffer_cents        bigint not null default 0
    check (min_cash_buffer_cents >= 0),

  -- Payday cadence drives the "before the next payday" expense window.
  pay_frequency                public.pay_frequency not null default 'biweekly',
  next_payday                  date,

  -- Week boundaries and due-date comparisons are evaluated in the user's zone,
  -- not the server's. IANA identifier.
  timezone                     text not null default 'America/New_York',

  onboarding_completed_at      timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Mirror new auth signups into public.users so the app always has a profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- plaid_items
-- One row per institution connection. This table holds the crown jewels: the
-- Plaid access_token. It is stored as ciphertext (AES-256-GCM, encrypted in the
-- app layer before it ever reaches Postgres) and is never exposed to browser
-- clients — see 0002_rls_policies.sql for the column-level grants.
-- =============================================================================
create table public.plaid_items (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.users (id) on delete cascade,

  plaid_item_id            text not null unique,          -- Plaid's item_id

  -- base64(iv || auth_tag || ciphertext). Never log, never select client-side.
  access_token_encrypted   text not null,
  key_version              smallint not null default 1,   -- supports key rotation

  institution_id           text,
  institution_name         text,
  available_products       text[] not null default '{}',
  billed_products          text[] not null default '{}',

  -- Cursor for /transactions/sync. Null until the first sync completes.
  transactions_cursor      text,

  status                   public.item_status not null default 'good',
  error_code               text,                          -- last Plaid error code
  consent_expires_at       timestamptz,

  last_transactions_sync_at timestamptz,
  last_liabilities_sync_at  timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index plaid_items_user_id_idx on public.plaid_items (user_id);
create index plaid_items_status_idx  on public.plaid_items (status) where status <> 'good';

create trigger plaid_items_set_updated_at
  before update on public.plaid_items
  for each row execute function public.set_updated_at();

comment on column public.plaid_items.access_token_encrypted is
  'AES-256-GCM ciphertext of the Plaid access_token, base64(iv||tag||ct). Decrypted only in server-side code holding PLAID_TOKEN_ENCRYPTION_KEY.';

-- =============================================================================
-- accounts
-- Every account returned by Plaid for an item: checking, savings, credit cards,
-- loans. Balances are refreshed on each sync.
-- =============================================================================
create table public.accounts (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.users (id) on delete cascade,
  item_id                 uuid not null references public.plaid_items (id) on delete cascade,

  plaid_account_id        text not null unique,

  name                    text not null,
  official_name           text,
  mask                    text,                            -- last 4
  type                    public.account_type not null,
  subtype                 text,                            -- 'checking', 'credit card', ...

  -- For depository: positive cash. For credit/loan: positive amount owed.
  current_balance_cents   bigint,
  available_balance_cents bigint,
  credit_limit_cents      bigint,
  iso_currency_code       text not null default 'USD',

  -- Which accounts count toward Total Liquid Cash. Generated so the engine's
  -- definition of "liquid" lives in exactly one place and stays indexable.
  is_liquid               boolean generated always as (
                            type = 'depository'
                            and coalesce(subtype, '') in ('checking', 'savings', 'cash management', 'money market')
                          ) stored,

  balances_updated_at     timestamptz,
  is_active               boolean not null default true,   -- false once removed at Plaid

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index accounts_user_id_idx on public.accounts (user_id);
create index accounts_item_id_idx on public.accounts (item_id);
create index accounts_liquid_idx  on public.accounts (user_id) where is_liquid and is_active;
create index accounts_type_idx    on public.accounts (user_id, type) where is_active;

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- =============================================================================
-- debts
-- The avalanche/snowball target set. Normally 1:1 with a credit or loan
-- account, but account_id is nullable so a user can track a debt Plaid cannot
-- see (a 0% promo card at a small issuer, money owed to a family member).
-- =============================================================================
create table public.debts (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.users (id) on delete cascade,

  -- unique: at most one debt row per linked account. NULL => manually tracked
  -- (Postgres allows many NULLs under a unique constraint).
  account_id                uuid unique references public.accounts (id) on delete cascade,

  name                      text not null,
  kind                      public.debt_kind not null default 'credit_card',

  current_balance_cents     bigint not null default 0 check (current_balance_cents >= 0),
  statement_balance_cents   bigint,
  credit_limit_cents        bigint,

  -- Annual percentage rate as a percentage, not a fraction: 24.99 means 24.99%.
  -- Plaid's liabilities.credit.aprs[].apr_percentage maps here directly.
  apr                       numeric(6,4) not null default 0
                              check (apr >= 0 and apr <= 100),
  -- Which APR this row reflects when a card reports several
  -- ('purchase_apr', 'balance_transfer_apr', 'cash_apr', 'special').
  apr_type                  text not null default 'purchase_apr',

  minimum_payment_cents     bigint not null default 0 check (minimum_payment_cents >= 0),
  next_due_date             date,
  last_payment_date         date,
  last_payment_cents        bigint,

  is_overdue                boolean not null default false,
  -- Set true once this cycle's minimum is confirmed paid. The algorithm refuses
  -- to route a strike anywhere until every active debt clears this gate.
  min_payment_met_for_cycle boolean not null default false,

  is_manual                 boolean generated always as (account_id is null) stored,
  is_active                 boolean not null default true,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index debts_user_id_idx      on public.debts (user_id) where is_active;
-- Serves the avalanche pick directly.
create index debts_avalanche_idx    on public.debts (user_id, apr desc) where is_active;
-- Serves the snowball pick directly.
create index debts_snowball_idx     on public.debts (user_id, current_balance_cents asc) where is_active;
create index debts_next_due_idx     on public.debts (user_id, next_due_date) where is_active;

create trigger debts_set_updated_at
  before update on public.debts
  for each row execute function public.set_updated_at();

-- =============================================================================
-- expenses
-- Known outflows the engine subtracts before declaring cash "safe to spend".
-- Rows may be user-entered or promoted from Plaid's recurring-transactions
-- streams; `source` records which, so a resync never clobbers manual edits.
-- =============================================================================
create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id) on delete cascade,
  account_id        uuid references public.accounts (id) on delete set null,

  name              text not null,
  category          text not null,                  -- 'housing', 'utilities', 'subscription', ...
  amount_cents      bigint not null check (amount_cents > 0),
  frequency         public.expense_frequency not null,
  next_due_date     date not null,

  source            public.expense_source not null default 'manual',
  plaid_stream_id   text unique,                    -- set when source = 'plaid_recurring'

  -- Essential bills are always reserved. Non-essential ones can be surfaced in
  -- the UI as "cut this to strike harder".
  is_essential      boolean not null default true,
  is_active         boolean not null default true,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- The cash-flow engine's hottest query: expenses due before the next payday.
create index expenses_due_idx     on public.expenses (user_id, next_due_date) where is_active;
create index expenses_account_idx on public.expenses (account_id);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- =============================================================================
-- transactions
-- Daily spend, synced via /transactions/sync. Powers variable-spend estimation
-- and week-to-date burn tracking.
-- =============================================================================
create table public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users (id) on delete cascade,
  account_id             uuid not null references public.accounts (id) on delete cascade,

  plaid_transaction_id   text not null unique,
  pending_transaction_id text,                       -- links a posted txn to its pending row

  -- Plaid's sign convention preserved: positive = money leaving the account.
  amount_cents           bigint not null,
  iso_currency_code      text not null default 'USD',

  date                   date not null,              -- posted date
  authorized_date        date,

  name                   text,
  merchant_name          text,
  pfc_primary            text,                       -- personal_finance_category.primary
  pfc_detailed           text,                       -- personal_finance_category.detailed

  is_pending             boolean not null default false,
  -- Card payments and internal moves must not count as living expenses.
  is_transfer            boolean not null default false,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index transactions_user_date_idx    on public.transactions (user_id, date desc);
create index transactions_account_date_idx on public.transactions (account_id, date desc);
create index transactions_spend_idx        on public.transactions (user_id, date desc)
  where not is_pending and not is_transfer;

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- =============================================================================
-- debt_strikes
-- One immutable-ish row per user per week: the full inputs and output of a
-- Debt Destroyer run. Keeping the breakdown means the dashboard can always
-- explain "why this number", and a rerun mid-week is idempotent per week.
-- =============================================================================
create table public.debt_strikes (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.users (id) on delete cascade,

  week_start               date not null,                    -- Monday, in user's timezone
  strategy                 public.debt_strategy not null,

  -- Inputs, captured at compute time.
  liquid_cash_cents        bigint not null,
  fixed_expenses_cents     bigint not null,
  variable_expenses_cents  bigint not null,
  minimums_reserved_cents  bigint not null,
  buffer_floor_cents       bigint not null,

  -- Outputs.
  safe_to_spend_cents      bigint not null,                  -- may be negative
  recommended_amount_cents bigint not null
                             check (recommended_amount_cents >= 0),
  target_debt_id           uuid references public.debts (id) on delete set null,

  status                   public.strike_status not null default 'recommended',
  -- Per-debt ranking, the expense rows counted, engine version.
  breakdown                jsonb not null default '{}'::jsonb,

  computed_at              timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  unique (user_id, week_start)
);

create index debt_strikes_user_week_idx on public.debt_strikes (user_id, week_start desc);

create trigger debt_strikes_set_updated_at
  before update on public.debt_strikes
  for each row execute function public.set_updated_at();

-- =============================================================================
-- plaid_webhook_events
-- Append-only inbox. Plaid retries webhooks, so processing must be idempotent;
-- dedupe_key is the guard. Service-role only — no client ever reads this.
-- =============================================================================
create table public.plaid_webhook_events (
  id             uuid primary key default gen_random_uuid(),
  plaid_item_id  text,
  webhook_type   text not null,
  webhook_code   text not null,
  dedupe_key     text not null unique,
  payload        jsonb not null,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz,
  error          text
);

create index plaid_webhook_events_unprocessed_idx
  on public.plaid_webhook_events (received_at)
  where processed_at is null;
