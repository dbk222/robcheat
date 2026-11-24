alter table public.orders
  add column if not exists stripe_payment_intent text,
  add column if not exists refunded_amount numeric(12,2) not null default 0 check (refunded_amount >= 0);
create index if not exists orders_stripe_payment_intent_idx on public.orders(stripe_payment_intent) where stripe_payment_intent is not null;