-- STAGING ONLY. All streamer/order/referral reads go through authenticated Edge Functions.
create index streamers_user_id_idx on public.streamers(user_id);
create index streamers_active_promo_idx on public.streamers(promo_code) where is_active = true;
create index referral_attributions_streamer_expiry_idx on public.referral_attributions(streamer_id, expires_at desc);
create index referral_events_streamer_created_idx on public.streamer_referral_events(streamer_id, created_at desc);
create index referral_events_type_created_idx on public.streamer_referral_events(event_type, created_at desc);
create index streamer_referral_events_attribution_id_idx on public.streamer_referral_events(attribution_id);
create index streamer_referral_events_order_id_idx on public.streamer_referral_events(order_id);
create index orders_streamer_paid_idx on public.orders(streamer_id, paid_at desc) where status = 'paid';
create index orders_user_id_idx on public.orders(user_id);

alter table public.profiles enable row level security;
alter table public.streamers enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.orders enable row level security;
alter table public.streamer_referral_events enable row level security;

revoke all on public.profiles, public.streamers, public.referral_attributions, public.orders, public.streamer_referral_events from anon, authenticated;
grant all on public.profiles, public.streamers, public.referral_attributions, public.orders, public.streamer_referral_events to service_role;

create policy "deny direct client access" on public.profiles for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.streamers for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.referral_attributions for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.orders for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.streamer_referral_events for all to anon, authenticated using (false) with check (false);
