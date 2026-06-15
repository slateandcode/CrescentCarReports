-- ════════════════════════════════════════════════════════════════════════
-- 014 — Rate-limiting primitive for the public website endpoints
--
-- SECURITY FIX. The Crescent Car Checks public site has three unauthenticated
-- routes — POST /api/contact, POST /api/bookings, GET /api/availability — with
-- NO rate limiting. They run with the service-role key (RLS-bypassing) against
-- THIS shared DB and a LIVE Stripe account, so an attacker could flood the owner
-- inbox + bloat contact_messages, squat every booking slot (DoS the funnel), or
-- enumerate availability. (This shared DB is owned by the Crescent Car Reports
-- migrations; the website ships no migrations of its own. It calls the function
-- below per request via lib/rate-limit.ts using its service-role client.)
--
-- A fixed-window counter in Postgres works across Netlify's stateless serverless
-- instances (in-process counters would not). Cross-instance and atomic.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.rate_limits (
  key           text        not null,
  window_start  timestamptz not null,
  count         int         not null default 0,
  primary key (key, window_start)
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

-- Direct access denied to the public roles; reached only via check_rate_limit
-- (SECURITY DEFINER, runs as owner) or the service-role key.
alter table public.rate_limits enable row level security;

-- Increment the counter for p_key in the current fixed window and report whether
-- the request is still within p_max. Returns TRUE = allowed, FALSE = over limit.
create or replace function public.check_rate_limit(
  p_key text,
  p_max int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count  int;
begin
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  -- Opportunistic cleanup of expired windows (~2% of calls) so the table can't
  -- grow unbounded. Old windows are never read again (the PK includes the
  -- window), so this is purely housekeeping.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 hour';
  end if;

  return v_count <= p_max;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
