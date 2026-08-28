-- =============================================================================
-- Debt Destroyer — manual debt tracking
--
-- Plaid's role narrows to depository accounts only: balances and transactions
-- for the cash-flow side. Debts and bills are entered by hand, which changes
-- one assumption in the original schema.
--
-- `min_payment_met_for_cycle` was a plain boolean, safe only because a nightly
-- /liabilities/get would overwrite it with fresh truth every cycle. Without
-- that refresh it is a latch: a user ticks "minimum paid" in August and the
-- flag reads true forever, so in September the engine believes the minimum is
-- covered and routes the whole strike elsewhere — straight past a real due
-- payment into a late fee.
--
-- Replaced with the due date the payment was made *for*. The engine compares
-- it against next_due_date, so the answer expires on its own when the cycle
-- rolls over. A stale value fails closed (minimum treated as unpaid) rather
-- than open.
-- =============================================================================

alter table public.debts
  drop column min_payment_met_for_cycle;

alter table public.debts
  add column min_payment_paid_for_due_date date;

comment on column public.debts.min_payment_paid_for_due_date is
  'The next_due_date whose minimum payment the user has confirmed paid. The minimum for the current cycle counts as met only when this equals the current next_due_date; any other value (including null) means unpaid.';

-- Manual debts carry a single user-entered rate, so the multi-APR bookkeeping
-- Plaid needed no longer applies.
alter table public.debts
  alter column apr_type set default 'manual';

comment on column public.debts.apr is
  'Annual percentage rate as a percentage, not a fraction: 24.99 means 24.99%. User-entered.';

-- Every debt is now user-owned rather than Plaid-synced. The RLS split between
-- manual and synced rows stays in place (it costs nothing and keeps the door
-- open if a card is ever linked), but the common path is a manual insert, so
-- give that path an index that does not assume an account_id.
drop index if exists public.debts_avalanche_idx;
drop index if exists public.debts_snowball_idx;

create index debts_avalanche_idx on public.debts (user_id, apr desc)
  where is_active;
create index debts_snowball_idx on public.debts (user_id, current_balance_cents asc)
  where is_active;

-- The cash-flow engine reads liquid balances constantly and now never reads a
-- credit account from Plaid. Narrow the account index to what is actually used.
create index if not exists accounts_depository_idx
  on public.accounts (user_id)
  where is_liquid and is_active;
