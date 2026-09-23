-- Move startDate and endDate from interviews to candidates
ALTER TABLE public.interviews
DROP COLUMN IF EXISTS "startDate",
DROP COLUMN IF EXISTS "endDate";

ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS "startDate" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "endDate" timestamp with time zone;
