-- Remove hardcoded info@inluwa.com special-casing. SYSTEM_ADMIN is now purely
-- data-driven via organization_members.role, managed directly in that table
-- (e.g. via Supabase Studio) rather than being tied to a specific email.

-- 1. Replace handle_new_user() so new signups no longer get an email-based role.
--    All new members default to ACCOUNT_ADMIN on their own org; SYSTEM_ADMIN
--    must be granted explicitly via organization_members.
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

-- 2. Replace the jobTemplates RLS policy so it checks organization_members
--    for SYSTEM_ADMIN role instead of a hardcoded email.
DROP POLICY IF EXISTS "System admin can manage job templates" ON public."jobTemplates";

CREATE POLICY "System admin can manage job templates"
  ON public."jobTemplates" FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."userId" = auth.uid() AND om.role = 'SYSTEM_ADMIN'
    )
  );

-- Note: no retroactive role downgrade/upgrade here — SYSTEM_ADMIN grants are
-- now managed directly on organization_members.role.
