-- Create coaching_candidates table
CREATE TABLE IF NOT EXISTS public.coaching_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "trainingId" UUID NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  "sessionId" UUID REFERENCES public.coaching_sessions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  gender TEXT,
  birthday TEXT,
  notes TEXT,
  education TEXT,
  school TEXT,
  major TEXT,
  "graduationYear" INTEGER,
  "workExperience" TEXT,
  "evaluationStatus" TEXT DEFAULT 'PENDING' CHECK ("evaluationStatus" IN ('PENDING', 'SHORTLISTED', 'WAITLISTED', 'REJECTED')),
  "cvAnalysis" JSONB,
  "hrComments" JSONB,
  "inviteToken" TEXT UNIQUE,
  "invitedAt" TIMESTAMPTZ,
  "startDate" TIMESTAMPTZ,
  "endDate" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coaching_candidates_training_email_idx ON public.coaching_candidates ("trainingId", email) WHERE email IS NOT NULL;

-- Create coaching_email_templates table
CREATE TABLE IF NOT EXISTS public.coaching_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "trainingId" UUID NOT NULL UNIQUE REFERENCES public.trainings(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  "reminderSubject" TEXT,
  "reminderBody" TEXT,
  "replyTo" TEXT,
  "logoUrl" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- Create coaching_email_send_logs table
CREATE TABLE IF NOT EXISTS public.coaching_email_send_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "trainingId" UUID NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  "candidateId" UUID REFERENCES public.coaching_candidates(id) ON DELETE CASCADE,
  "sentBy" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  "messageId" TEXT,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coaching_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_email_send_logs ENABLE ROW LEVEL SECURITY;

-- coaching_candidates Policies
CREATE POLICY "coaching_candidates_read" ON public.coaching_candidates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trainings t
      JOIN public.organization_members om ON om."workspaceId" = t."organizationId"
      WHERE t.id = "trainingId" AND om."userId" = auth.uid()
    )
  );

CREATE POLICY "coaching_candidates_insert" ON public.coaching_candidates
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trainings t
      JOIN public.organization_members om ON om."workspaceId" = t."organizationId"
      WHERE t.id = "trainingId" AND om."userId" = auth.uid() AND om.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN', 'EDITOR')
    )
  );

CREATE POLICY "coaching_candidates_update" ON public.coaching_candidates
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trainings t
      JOIN public.organization_members om ON om."workspaceId" = t."organizationId"
      WHERE t.id = "trainingId" AND om."userId" = auth.uid() AND om.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN', 'EDITOR')
    )
  );

CREATE POLICY "coaching_candidates_delete" ON public.coaching_candidates
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trainings t
      JOIN public.organization_members om ON om."workspaceId" = t."organizationId"
      WHERE t.id = "trainingId" AND om."userId" = auth.uid() AND om.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN', 'EDITOR')
    )
  );

CREATE POLICY "coaching_candidates_public_read" ON public.coaching_candidates
  FOR SELECT TO anon
  USING ("inviteToken" IS NOT NULL);

-- coaching_email_templates Policies
CREATE POLICY "coaching_email_templates_read" ON public.coaching_email_templates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trainings t
      JOIN public.organization_members om ON om."workspaceId" = t."organizationId"
      WHERE t.id = "trainingId" AND om."userId" = auth.uid()
    )
  );

CREATE POLICY "coaching_email_templates_write" ON public.coaching_email_templates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trainings t
      JOIN public.organization_members om ON om."workspaceId" = t."organizationId"
      WHERE t.id = "trainingId" AND om."userId" = auth.uid() AND om.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN', 'EDITOR')
    )
  );

-- coaching_email_send_logs Policies
CREATE POLICY "coaching_email_send_logs_read" ON public.coaching_email_send_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trainings t
      JOIN public.organization_members om ON om."workspaceId" = t."organizationId"
      WHERE t.id = "trainingId" AND om."userId" = auth.uid()
    )
  );

CREATE POLICY "coaching_email_send_logs_insert" ON public.coaching_email_send_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trainings t
      JOIN public.organization_members om ON om."workspaceId" = t."organizationId"
      WHERE t.id = "trainingId" AND om."userId" = auth.uid() AND om.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN', 'EDITOR')
    )
  );

-- Service role full access
GRANT ALL ON public.coaching_candidates TO service_role;
GRANT ALL ON public.coaching_email_templates TO service_role;
GRANT ALL ON public.coaching_email_send_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_candidates TO authenticated;
GRANT SELECT ON public.coaching_candidates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_email_templates TO authenticated;
GRANT SELECT, INSERT ON public.coaching_email_send_logs TO authenticated;
