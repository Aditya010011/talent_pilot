ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS "cvAssessmentCriteria" jsonb,
  ADD COLUMN IF NOT EXISTS "cvJdAlignmentCriteria" jsonb;
