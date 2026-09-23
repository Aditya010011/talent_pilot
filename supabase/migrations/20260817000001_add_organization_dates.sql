-- Organization-level start and expiry dates. SYSTEM_ADMIN sets these for an org;
-- they apply to all ACCOUNT_ADMIN / EDITOR / VIEWER members (synced to user metadata).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS "startDate" timestamptz NULL,
  ADD COLUMN IF NOT EXISTS "expireDate" timestamptz NULL;
