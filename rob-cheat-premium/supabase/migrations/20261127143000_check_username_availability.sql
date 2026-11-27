CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    p_username ~ '^[A-Za-z0-9_-]{3,24}$'
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE lower(btrim(p.display_name)) = lower(btrim(p_username))
    ),
    false
  );
$function$;

-- This intentionally exposes only a boolean availability result to anonymous
-- visitors. It does not expose profile rows, emails, IDs, or any other data.
REVOKE ALL ON FUNCTION public.is_username_available(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon;

COMMENT ON FUNCTION public.is_username_available(text) IS
  'Public signup helper: returns only whether a syntactically valid username is free; exposes no profile data.';
