-- Add quiz columns to public.trainings
ALTER TABLE public.trainings 
ADD COLUMN IF NOT EXISTS "quiz_settings" JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS "quiz_questions" JSONB DEFAULT '[]'::jsonb;

-- Add quiz_results column to public.coaching_sessions
ALTER TABLE public.coaching_sessions 
ADD COLUMN IF NOT EXISTS "quiz_results" JSONB DEFAULT '{}'::jsonb;
