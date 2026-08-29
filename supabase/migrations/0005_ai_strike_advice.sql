-- =============================================================================
-- Debt Destroyer — AI advisory layer
--
-- The deterministic engine stays the source of truth. These columns hold a
-- second opinion alongside it, never in place of it: `recommended_amount_cents`
-- is still what the math produced, and the AI's number sits beside it so the UI
-- can show both and the user can see the difference.
-- =============================================================================

alter table public.debt_strikes
  add column ai_adjusted_amount_cents bigint
    check (ai_adjusted_amount_cents is null or ai_adjusted_amount_cents >= 0),
  add column ai_rationale text;

comment on column public.debt_strikes.ai_adjusted_amount_cents is
  'A more conservative strike suggested by the advisory layer, in cents. Null when no advice has been generated for this week. Never authoritative: the deterministic recommended_amount_cents remains the computed truth, and the UI only prefers this value when it is lower.';

comment on column public.debt_strikes.ai_rationale is
  'One or two sentences explaining the adjustment, shown to the user beneath the number. Model-generated prose — render as text, never as markup.';

-- Deliberately no cross-column CHECK that the AI value must be <= the
-- deterministic one. It reads as a tempting guardrail, but the two are written
-- at different times: a mid-week recompute that lowers recommended_amount_cents
-- would start failing every upsert against advice stored on Monday, and the
-- dashboard would 500 rather than simply showing a stale suggestion. The
-- invariant is enforced where it can degrade gracefully instead — the writer
-- clamps to the deterministic amount, and the UI only prefers the AI number
-- when it is genuinely lower.

-- -----------------------------------------------------------------------------
-- Close a column-level gap on debt_strikes.
--
-- The row was protected but its columns were not. INSERT has no client policy,
-- so nobody can invent a strike — but the UPDATE policy only checked row
-- ownership, and RLS does not filter columns. A signed-in user could therefore
-- PATCH their own row and set recommended_amount_cents to anything at all.
-- Verified against a live database before writing this: the update succeeded.
--
-- Accepting, skipping, or marking a strike paid only ever needs `status`. That
-- is the entire legitimate client write surface, so grant exactly it. Every
-- computed figure — including the new AI columns — is now writable only by the
-- service role, which is what the sync and advisory routes already use.
-- -----------------------------------------------------------------------------
revoke update on public.debt_strikes from anon, authenticated;
grant update (status) on public.debt_strikes to authenticated;
