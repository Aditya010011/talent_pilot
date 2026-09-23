-- Add video recording URL column to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS "videoRecordingUrl" text;
