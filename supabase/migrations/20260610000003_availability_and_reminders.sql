-- Add startDate and endDate to interviews table
ALTER TABLE "interviews" 
ADD COLUMN IF NOT EXISTS "startDate" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "endDate" timestamp with time zone;

-- Add reminderSubject and reminderBody to email_templates
ALTER TABLE "email_templates"
ADD COLUMN IF NOT EXISTS "reminderSubject" text NOT NULL DEFAULT 'Reminder: Upcoming interview for {{interview_title}}',
ADD COLUMN IF NOT EXISTS "reminderBody" text NOT NULL DEFAULT '';
