-- ════════════════════════════════════════════════════════════════════════
-- 017 — Record the real amount paid + promotion-code discount on bookings
--
-- total_price is the LIST price stamped on the hold at create_booking_hold
-- time. When a customer applies a Stripe promotion code (Checkout's
-- allow_promotion_codes field), the amount actually charged drops below
-- total_price — but nothing reconciled the row afterwards, so the admin
-- dashboard kept showing the undiscounted list price. These three nullable
-- columns let the website's Stripe webhook persist what Stripe ACTUALLY
-- charged (via a best-effort service-role UPDATE — the confirm_booking_paid
-- RPC is intentionally left unchanged).
--
-- UNITS — IMPORTANT: amount_paid and discount_amount are in INTEGER FILS
-- (1 AED = 100 fils), NOT integer AED like package_price / travel_fee /
-- total_price. A percentage promo code can yield a fractional-AED discount
-- (e.g. 25% of AED 449 = AED 112.25); Stripe reports amount_total and
-- total_details.amount_discount in fils, so storing fils is lossless and
-- always a clean integer. Divide by 100 for display. NEVER sum these against
-- the AED columns. promo_code is the code string the customer entered
-- (e.g. 'CRESCENT50'); NULL when no code was used / for older bookings.
--
-- All three are NULLABLE and additive: pre-017 paid bookings and manual
-- offline bookings keep NULL, and the admin UI falls back to total_price when
-- amount_paid is NULL — so this is fully backward compatible. Adding nullable
-- columns takes no table rewrite; the NOT VALID + VALIDATE split keeps the
-- guard checks from holding a long ACCESS EXCLUSIVE lock.
-- ════════════════════════════════════════════════════════════════════════

alter table public.bookings
  add column if not exists amount_paid     integer,  -- fils; real charge after promo (NULL = unknown → show total_price)
  add column if not exists discount_amount integer,  -- fils; promo saving (NULL or 0 = no discount)
  add column if not exists promo_code      text;     -- promotion-code string entered at Checkout (NULL = none)

-- Non-negative guards. Idempotent (re-runnable) via a name-existence check so a
-- partial re-apply never errors on "constraint already exists". NULL passes.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_amount_paid_nonneg') then
    alter table public.bookings
      add constraint bookings_amount_paid_nonneg
      check (amount_paid is null or amount_paid >= 0) not valid;
    alter table public.bookings validate constraint bookings_amount_paid_nonneg;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bookings_discount_amount_nonneg') then
    alter table public.bookings
      add constraint bookings_discount_amount_nonneg
      check (discount_amount is null or discount_amount >= 0) not valid;
    alter table public.bookings validate constraint bookings_discount_amount_nonneg;
  end if;
end $$;
