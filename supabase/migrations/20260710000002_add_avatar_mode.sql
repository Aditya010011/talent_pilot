-- Add avatarMode column to interviews table
ALTER TABLE public."interviews"
  ADD COLUMN IF NOT EXISTS "avatarMode" text NOT NULL DEFAULT 'none'
  CHECK ("avatarMode" IN ('none', 'static', 'simli'));

-- Back-fill existing rows:
-- If videoEnabled=true they were already using Simli
UPDATE public."interviews" SET "avatarMode" = 'simli' WHERE "videoEnabled" = true;
-- voiceEnabled=true but not video → voice-only (leave as 'none' - default already correct)
