-- Let candidates pick coaching language per session (voice-only / no avatar).
ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS "multilingualEnabled" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.trainings."multilingualEnabled" IS
  'When true and presenter avatar is off, candidates choose the session language at start. TTS and chat follow that choice. Hidden when avatar/video is on.';

ALTER TABLE public.coaching_sessions
  ADD COLUMN IF NOT EXISTS language text;

COMMENT ON COLUMN public.coaching_sessions.language IS
  'Candidate-chosen language for this session. Null falls back to trainings.language.';
