-- STAGING ONLY: robcheat-streamer-staging (dyurswsueobfvhluglvb)
-- Do not apply this bootstrap file to the existing production project.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.streamers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 64),
  promo_code text not null unique check (promo_code = upper(promo_code) and promo_code ~ '^[A-Z0-9_-]{3,24}$'),
  user_id uuid unique references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.referral_attributions (
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

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null default 'stripe',
  provider_order_id text unique,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'EUR',
  product_code text not null default 'robcheat',
  plan text not null,
  status text not null default 'pending',
  license_id uuid,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  streamer_id uuid references public.streamers(id) on delete set null,
  promo_code text,
  promo_discount_percent integer not null default 0 check (promo_discount_percent between 0 and 100),
  promo_discount_amount numeric(12,2) not null default 0 check (promo_discount_amount >= 0),
  visitor_id uuid,
  attribution_source text,
  referral_clicked_at timestamptz,
  referral_expires_at timestamptz
);

create table public.streamer_referral_events (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  event_type text not null check (event_type in ('click','checkout_started','purchase','refund')),
  visitor_id uuid,
  promo_code text,
  attribution_source text,
  attribution_id uuid references public.referral_attributions(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  provider_session_id text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
