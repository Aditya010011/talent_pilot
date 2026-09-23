-- Avatar image + TTS voice for non-interactive (Pruna p-video-avatar) pregeneration
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS "avatarImageUrl" text,
  ADD COLUMN IF NOT EXISTS "avatarVoice" text;

COMMENT ON COLUMN interviews."avatarImageUrl" IS
  'Public URL of the still image used for non-interactive avatar video pregeneration';
COMMENT ON COLUMN interviews."avatarVoice" IS
  'Pruna/Runware speech.voice id, e.g. Aoede (Female)';
