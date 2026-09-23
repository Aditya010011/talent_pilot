-- 1. Replace the handle_new_user() trigger function to enforce role rules
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id  uuid;
  proj_id uuid;
  assigned_role public."MemberRole";
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

  org_id  := gen_random_uuid();
  proj_id := gen_random_uuid();

  -- Determine role based on email
  IF NEW.email = 'info@inluwa.com' THEN
    assigned_role := 'SYSTEM_ADMIN';
  ELSE
    assigned_role := 'ACCOUNT_ADMIN';
  END IF;

  INSERT INTO public.organizations (id, name, slug, "ownerId")
  VALUES (org_id, 'Personal', 'personal-' || NEW.id::text, NEW.id)
  ON CONFLICT (slug) DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.organization_members ("workspaceId", "userId", role)
    VALUES (org_id, NEW.id, assigned_role);

    INSERT INTO public.projects (id, "organizationId", name, "createdBy")
    VALUES (proj_id, org_id, 'Default', NEW.id);
  END IF;

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

-- 3. Also make sure info@inluwa.com has SYSTEM_ADMIN if they somehow lost it or don't have it on their personal workspace
UPDATE public.organization_members om
SET role = 'SYSTEM_ADMIN'
FROM auth.users u, public.organizations o
WHERE om."userId" = u.id 
  AND om."workspaceId" = o.id
  AND o."ownerId" = u.id
  AND u.email = 'info@inluwa.com'
  AND om.role != 'SYSTEM_ADMIN';
