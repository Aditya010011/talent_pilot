-- Add interaction_mode to interviews if not already present
-- The previous migration renamed is_non_interactive to is_voice_only. We need a way to track the new mode.
ALTER TABLE interviews
ADD COLUMN IF NOT EXISTS interaction_mode text DEFAULT 'interactive';

-- Add pregenerated_videos to store the Vidu video URLs (intro, questions, outro)
ALTER TABLE interviews
ADD COLUMN IF NOT EXISTS pregenerated_videos jsonb;
