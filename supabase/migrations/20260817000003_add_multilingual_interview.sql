-- Let candidates pick interview language per session (realtime avatar / voice-only).
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS "multilingualEnabled" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.interviews."multilingualEnabled" IS
  'When true, candidates choose the interview language at session start. TTS/STT follow that choice. Hidden for non-interactive (pregenerated) interviews.';

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS language text;

COMMENT ON COLUMN public.sessions.language IS
  'Candidate-chosen language for this session. Null falls back to interviews.language.';
