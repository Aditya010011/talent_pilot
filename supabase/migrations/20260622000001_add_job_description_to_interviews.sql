-- Add jobDescription column to interviews table
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS "jobDescription" TEXT;
