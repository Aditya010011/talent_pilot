-- ============================================================
-- Coaching Mode: trainings + coaching_sessions tables
-- ============================================================

-- trainings (mirrors the interviews table structure)
CREATE TABLE IF NOT EXISTS public.trainings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectId" UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  "organizationId" UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  objective TEXT,
  "aiName" TEXT DEFAULT 'AI Coach',
  "aiTone" TEXT DEFAULT 'PROFESSIONAL',
  language TEXT DEFAULT 'en',
  "avatarMode" TEXT DEFAULT 'vidu',
  "avatarImageUrl" TEXT,
  "avatarVoice" TEXT,
  "pregenerated_videos" JSONB,
  "timeLimitMinutes" INTEGER,
  "publicSlug" TEXT UNIQUE,
  "isActive" BOOLEAN DEFAULT true,
  "userId" UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- coaching_sessions (mirrors the sessions table)
CREATE TABLE IF NOT EXISTS public.coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "trainingId" UUID NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  "participantName" TEXT,
  "participantEmail" TEXT,
  status TEXT DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
  "startedAt" TIMESTAMPTZ DEFAULT now(),
  "completedAt" TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS trainings_project_id_idx ON public.trainings("projectId");
CREATE INDEX IF NOT EXISTS trainings_org_id_idx ON public.trainings("organizationId");
CREATE INDEX IF NOT EXISTS trainings_slug_idx ON public.trainings("publicSlug");
CREATE INDEX IF NOT EXISTS coaching_sessions_training_id_idx ON public.coaching_sessions("trainingId");

-- RLS
ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_sessions ENABLE ROW LEVEL SECURITY;

-- Trainings: org members can read, admins/editors can write
CREATE POLICY "trainings_read" ON public.trainings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."workspaceId" = "organizationId"
        AND om."userId" = auth.uid()
    )
  );

CREATE POLICY "trainings_insert" ON public.trainings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."workspaceId" = "organizationId"
        AND om."userId" = auth.uid()
        AND om.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN', 'EDITOR')
    )
  );

CREATE POLICY "trainings_update" ON public.trainings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."workspaceId" = "organizationId"
        AND om."userId" = auth.uid()
        AND om.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN', 'EDITOR')
    )
  );

CREATE POLICY "trainings_delete" ON public.trainings
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."workspaceId" = "organizationId"
        AND om."userId" = auth.uid()
        AND om.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN')
    )
  );

-- Public read for active trainings (for the /c/[slug] route)
CREATE POLICY "trainings_public_read" ON public.trainings
  FOR SELECT TO anon
  USING ("isActive" = true AND "publicSlug" IS NOT NULL);

-- Coaching sessions: linked training's org members can read; anyone can insert (public session)
CREATE POLICY "coaching_sessions_read" ON public.coaching_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trainings t
      JOIN public.organization_members om ON om."workspaceId" = t."organizationId"
      WHERE t.id = "trainingId"
        AND om."userId" = auth.uid()
    )
  );

CREATE POLICY "coaching_sessions_insert_anon" ON public.coaching_sessions
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "coaching_sessions_insert_auth" ON public.coaching_sessions
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "coaching_sessions_update_anon" ON public.coaching_sessions
  FOR UPDATE TO anon
  USING (true);

CREATE POLICY "coaching_sessions_update_auth" ON public.coaching_sessions
  FOR UPDATE TO authenticated
  USING (true);

-- Service role full access
GRANT ALL ON public.trainings TO service_role;
GRANT ALL ON public.coaching_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.trainings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.coaching_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.coaching_sessions TO anon;
