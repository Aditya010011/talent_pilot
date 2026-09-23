-- Add whiteboardEnabled and codeEnabled columns to interviews table
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS "whiteboardEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS "codeEnabled" BOOLEAN NOT NULL DEFAULT true;
