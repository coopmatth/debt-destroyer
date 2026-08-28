-- =============================================================================
-- Debt Destroyer — Row Level Security
--
-- Threat model: the anon key ships to the browser. Assume an attacker can issue
-- arbitrary PostgREST queries as `anon` or as any authenticated user. RLS is
-- therefore the only real boundary; API-route checks are defense in depth.
--
-- Rules applied here:
--   1. RLS on every table in `public`. No exceptions, including tables clients
--      never touch — a missing policy set is a silent data leak.
--   2. Ownership predicates use `(select auth.uid())` rather than `auth.uid()`.
--      The subquery form is evaluated once per statement as an InitPlan instead
--      of once per row, which matters on the transactions table.
--   3. Plaid access tokens are unreachable from client roles via column-level
--      GRANTs — RLS filters rows, not columns, so grants do that half.
--   4. Writes that must stay server-authoritative (synced balances, debts,
--      webhook rows) have no client policy at all; the service role bypasses
--      RLS and remains the only writer.
-- =============================================================================

alter table public.users                enable row level security;
alter table public.plaid_items          enable row level security;
alter table public.accounts             enable row level security;
alter table public.debts                enable row level security;
alter table public.expenses             enable row level security;
alter table public.transactions         enable row level security;
alter table public.debt_strikes         enable row level security;
alter table public.plaid_webhook_events enable row level security;

-- Belt and braces: Supabase grants table privileges to anon/authenticated by
-- default, so lock the sensitive tables down explicitly before adding policies.
revoke all on public.plaid_items          from anon, authenticated;
revoke all on public.plaid_webhook_events from anon, authenticated;

-- -----------------------------------------------------------------------------
-- users — read and update own profile. Inserts come from the auth trigger,
-- deletes cascade from auth.users; neither is a client operation.
-- -----------------------------------------------------------------------------
create policy users_select_own on public.users
  for select to authenticated
  using ((select auth.uid()) = id);

create policy users_update_own on public.users
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- -----------------------------------------------------------------------------
-- plaid_items — clients may list their connections to render "Chase • synced
-- 2h ago" and prompt re-auth, and nothing more. The access token column is not
-- in the grant list, so `select *` from a client role errors instead of
-- leaking. All writes go through server-side service-role code.
-- -----------------------------------------------------------------------------
grant select (
  id, user_id, institution_id, institution_name, status, error_code,
  consent_expires_at, last_transactions_sync_at, last_liabilities_sync_at,
  created_at, updated_at
) on public.plaid_items to authenticated;

create policy plaid_items_select_own on public.plaid_items
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- accounts — read-only to clients; balances are server-synced from Plaid.
-- -----------------------------------------------------------------------------
create policy accounts_select_own on public.accounts
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- debts — read-only for Plaid-linked rows, full CRUD for manual ones. The
-- `is_manual` guard in the write policies is what stops a client from editing
-- the APR on a synced card to game its avalanche ranking.
-- -----------------------------------------------------------------------------
create policy debts_select_own on public.debts
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy debts_insert_own_manual on public.debts
  for insert to authenticated
  with check ((select auth.uid()) = user_id and account_id is null);

create policy debts_update_own_manual on public.debts
  for update to authenticated
  using ((select auth.uid()) = user_id and is_manual)
  with check ((select auth.uid()) = user_id and account_id is null);

create policy debts_delete_own_manual on public.debts
  for delete to authenticated
  using ((select auth.uid()) = user_id and is_manual);

-- -----------------------------------------------------------------------------
-- expenses — fully user-editable; this is the main knob a user turns to change
-- their recommendation.
-- -----------------------------------------------------------------------------
create policy expenses_select_own on public.expenses
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy expenses_insert_own on public.expenses
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy expenses_update_own on public.expenses
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy expenses_delete_own on public.expenses
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- transactions — read-only; written by the sync job only.
-- -----------------------------------------------------------------------------
create policy transactions_select_own on public.transactions
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- debt_strikes — clients read their history and may accept/skip a
-- recommendation. They cannot invent one: the amount and target are computed
-- server-side, so INSERT has no client policy.
-- -----------------------------------------------------------------------------
create policy debt_strikes_select_own on public.debt_strikes
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy debt_strikes_update_own on public.debt_strikes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- plaid_webhook_events — no policies. RLS is on and every client role is
-- revoked, so only the service role can touch it.
-- -----------------------------------------------------------------------------
