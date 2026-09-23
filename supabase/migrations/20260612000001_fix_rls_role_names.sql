-- Fix RLS policies that still reference old MemberRole values (OWNER, ADMIN, MEMBER)
-- after the rename migration 20260529000000_rename_member_roles.sql changed them to:
--   OWNER  -> SYSTEM_ADMIN
--   ADMIN  -> ACCOUNT_ADMIN
--   MEMBER -> EDITOR

-- ── PROJECTS ────────────────────────────────────────────────

DROP POLICY IF EXISTS "Org admins can insert projects" ON projects;
DROP POLICY IF EXISTS "Org admins can update projects" ON projects;
DROP POLICY IF EXISTS "Org admins can delete projects" ON projects;

CREATE POLICY "Org admins can insert projects"
  ON projects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members."workspaceId" = projects."organizationId"
        AND organization_members."userId" = (SELECT auth.uid())
        AND organization_members.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN')
    )
  );

CREATE POLICY "Org admins can update projects"
  ON projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members."workspaceId" = projects."organizationId"
        AND organization_members."userId" = (SELECT auth.uid())
        AND organization_members.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members."workspaceId" = projects."organizationId"
        AND organization_members."userId" = (SELECT auth.uid())
        AND organization_members.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN')
    )
  );

CREATE POLICY "Org admins can delete projects"
  ON projects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members."workspaceId" = projects."organizationId"
        AND organization_members."userId" = (SELECT auth.uid())
        AND organization_members.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN')
    )
  );

-- ── PROJECT MEMBERS ─────────────────────────────────────────

DROP POLICY IF EXISTS "Org admins can manage project members" ON project_members;

CREATE POLICY "Org admins can manage project members"
  ON project_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om."workspaceId" = p."organizationId"
      WHERE p.id = project_members."projectId"
        AND om."userId" = (SELECT auth.uid())
        AND om.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om."workspaceId" = p."organizationId"
      WHERE p.id = project_members."projectId"
        AND om."userId" = (SELECT auth.uid())
        AND om.role IN ('SYSTEM_ADMIN', 'ACCOUNT_ADMIN')
    )
  );
