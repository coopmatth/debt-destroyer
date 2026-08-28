-- =============================================================================
-- Debt Destroyer — expense payment tracking
--
-- The engine reserves bills due between now and the next payday. With
-- hand-maintained due dates that creates a stale-data problem: rent due on the
-- 1st is paid on the 1st, but next_due_date still reads the 1st until the user
-- edits it, so the engine keeps reserving $1,800 that is already gone and
-- under-recommends every week for the rest of the month.
--
-- Two mitigations, and this column is the precise one: the user marks the bill
-- paid, and the engine skips every occurrence on or before that date. The other
-- is a seven-day grace window in the engine, which bounds the damage when
-- nobody marks anything.
-- =============================================================================

alter table public.expenses
  add column last_paid_date date;

comment on column public.expenses.last_paid_date is
  'The most recent occurrence the user confirmed paid. The engine skips any occurrence falling on or before this date, so a paid bill stops consuming the weekly buffer without the user having to edit next_due_date.';

-- The engine reads active bills ordered by due date on every recompute.
create index if not exists expenses_engine_idx
  on public.expenses (user_id, next_due_date)
  where is_active;

-- debt_strikes gains the fields the plan actually produces. `breakdown` already
-- holds the line items; these are the summary values worth querying directly.
alter table public.debt_strikes
  add column if not exists engine_version smallint not null default 1,
  add column if not exists next_payday date,
  add column if not exists shortfall_cents bigint not null default 0;

comment on column public.debt_strikes.engine_version is
  'Which version of the algorithm produced this row. A stored recommendation is only interpretable alongside the arithmetic that made it.';
