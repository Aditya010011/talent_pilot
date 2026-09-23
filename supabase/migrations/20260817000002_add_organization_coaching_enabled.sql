-- Per-organization coaching feature flag. SYSTEM_ADMIN enables for clients that need it.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS "coachingEnabled" boolean NOT NULL DEFAULT false;
