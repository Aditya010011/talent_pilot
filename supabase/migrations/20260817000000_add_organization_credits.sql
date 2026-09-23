-- Organization-level credit balance. SYSTEM_ADMIN sets this for an org;
-- it is synced onto ACCOUNT_ADMIN / EDITOR / VIEWER members for spend checks.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 0;
