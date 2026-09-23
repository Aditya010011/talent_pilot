-- 1. Replace the handle_new_user() trigger function to NOT create Personal orgs
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    name   = coalesce(excluded.name, profiles.name),
    avatar = coalesce(excluded.avatar, profiles.avatar);

  RETURN NEW;
END;
$$;

-- 2. Retroactively downgrade any existing SYSTEM_ADMINs to ACCOUNT_ADMIN unless they are info@inluwa.com
UPDATE public.organization_members om
SET role = 'ACCOUNT_ADMIN'
FROM auth.users u
WHERE om."userId" = u.id 
  AND om.role = 'SYSTEM_ADMIN' 
  AND u.email != 'info@inluwa.com';

-- 3. Delete all Personal organizations (name = 'Personal' or slug starts with 'personal-')
-- Cascading deletes from organization_members and projects.
DELETE FROM public.organizations
WHERE name = 'Personal'
   OR slug LIKE 'personal-%';
