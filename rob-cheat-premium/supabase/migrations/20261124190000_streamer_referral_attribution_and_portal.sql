-- ROB CHEAT Streamer Portal / Referral Attribution
-- Applied to Supabase project rzbvtzeqrcfutfafaamm.
-- New event and attribution tables are service-role only; no customer Data API exposure.

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  visitor_id uuid not null,
  promo_code text not null,
  source text,
  page_path text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint referral_attributions_valid_window check (expires_at > created_at)
);

alter table public.orders
  add column if not exists visitor_id uuid,
  add column if not exists attribution_source text,
  add column if not exists referral_attribution_id uuid references public.referral_attributions(id) on delete set null,
  add column if not exists referral_clicked_at timestamptz,
  add column if not exists referral_expires_at timestamptz;

create table if not exists public.streamer_referral_events (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  event_type text not null check (event_type in ('click','checkout_started','purchase','refund')),
  visitor_id uuid,
  promo_code text,
  attribution_source text,
  attribution_id uuid references public.referral_attributions(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  provider_session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists streamers_user_id_idx on public.streamers(user_id);
create index if not exists streamers_active_promo_idx on public.streamers(promo_code) where is_active=true;
create index if not exists referral_attributions_streamer_expiry_idx on public.referral_attributions(streamer_id,expires_at desc);
create index if not exists streamer_referral_events_streamer_created_idx on public.streamer_referral_events(streamer_id,created_at desc);
create index if not exists streamer_referral_events_type_created_idx on public.streamer_referral_events(event_type,created_at desc);
create index if not exists streamer_referral_events_attribution_id_idx on public.streamer_referral_events(attribution_id);
create index if not exists streamer_referral_events_order_id_idx on public.streamer_referral_events(order_id);
create index if not exists streamer_referral_events_session_idx on public.streamer_referral_events(provider_session_id);
create index if not exists streamer_referral_events_type_session_uidx on public.streamer_referral_events(event_type,provider_session_id) where provider_session_id is not null;
create index if not exists orders_streamer_paid_idx on public.orders(streamer_id,paid_at desc) where status='paid';
create index if not exists orders_referral_attribution_idx on public.orders(referral_attribution_id);

alter table public.referral_attributions enable row level security;
alter table public.streamer_referral_events enable row level security;

revoke all on public.referral_attributions, public.streamer_referral_events from anon, authenticated;
grant all on public.referral_attributions, public.streamer_referral_events to service_role;

drop policy if exists "deny direct client access" on public.streamers;
create policy "deny direct client access" on public.streamers for all to anon, authenticated using (false) with check (false);
drop policy if exists "deny direct client access" on public.referral_attributions;
create policy "deny direct client access" on public.referral_attributions for all to anon, authenticated using (false) with check (false);
drop policy if exists "deny direct client access" on public.streamer_referral_events;
create policy "deny direct client access" on public.streamer_referral_events for all to anon, authenticated using (false) with check (false);
