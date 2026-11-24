-- Add an explicit streamer role and assign it to the 25 linked active streamer accounts.
-- Other customer profiles and administrator profiles are left unchanged.
DO $$
DECLARE
  active_streamers integer;
  linked_profiles integer;
  linked_admins integer;
BEGIN
  SELECT count(*) INTO active_streamers FROM public.streamers WHERE is_active = true;
  SELECT count(*) INTO linked_profiles
  FROM public.streamers s JOIN public.profiles p ON p.id = s.user_id
  WHERE s.is_active = true AND s.user_id IS NOT NULL;
  SELECT count(*) INTO linked_admins
  FROM public.streamers s JOIN public.profiles p ON p.id = s.user_id
  WHERE s.is_active = true AND s.user_id IS NOT NULL AND p.role = 'admin';
  IF active_streamers <> 25 THEN RAISE EXCEPTION 'Expected 25 active streamer records; found %', active_streamers; END IF;
  IF linked_profiles <> 25 THEN RAISE EXCEPTION 'Expected 25 active streamer accounts with profiles; found %', linked_profiles; END IF;
  IF linked_admins <> 0 THEN RAISE EXCEPTION 'A linked streamer account is an administrator; refusing to change role'; END IF;
END $$;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['customer'::text, 'streamer'::text, 'admin'::text]));
UPDATE public.profiles p SET role = 'streamer', updated_at = now()
FROM public.streamers s WHERE s.user_id = p.id AND s.is_active = true AND p.role <> 'streamer';
DO $$
DECLARE streamer_profiles integer;
BEGIN
  SELECT count(*) INTO streamer_profiles
  FROM public.streamers s JOIN public.profiles p ON p.id = s.user_id
  WHERE s.is_active = true AND p.role = 'streamer';
  IF streamer_profiles <> 25 THEN RAISE EXCEPTION 'Expected 25 streamer-role profiles after migration; found %', streamer_profiles; END IF;
END $$;
