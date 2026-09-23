-- Per-organization interview product flag.
-- Existing orgs keep Interview (DEFAULT true). Coaching-created orgs set this to false.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS "interviewEnabled" boolean NOT NULL DEFAULT true;
