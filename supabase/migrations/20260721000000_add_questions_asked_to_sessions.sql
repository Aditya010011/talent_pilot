-- Add questionsAsked array to sessions to track strictly which questions have been answered.
ALTER TABLE sessions ADD COLUMN "questionsAsked" uuid[] NOT NULL DEFAULT '{}';
