-- Add cvAnalysis JSONB column to candidates table to store advanced AI evaluation results
ALTER TABLE candidates
ADD COLUMN "cvAnalysis" JSONB;
