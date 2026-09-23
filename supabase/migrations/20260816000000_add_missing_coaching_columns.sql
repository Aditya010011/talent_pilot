ALTER TABLE public.trainings 
ADD COLUMN IF NOT EXISTS "presentation_text" text,
ADD COLUMN IF NOT EXISTS "script_slides" jsonb,
ADD COLUMN IF NOT EXISTS "generation_status" text DEFAULT 'IDLE';
