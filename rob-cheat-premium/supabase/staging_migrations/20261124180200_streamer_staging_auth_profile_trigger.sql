-- STAGING ONLY. The private trigger creates a normal customer profile for each new Auth user.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
grant execute on function private.handle_new_auth_user() to supabase_auth_admin;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();
