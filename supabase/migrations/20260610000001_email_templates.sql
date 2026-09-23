-- ============================================================
-- Email Templates & Send Logs
-- ============================================================

-- email_templates: one per interview, stores the customizable template
CREATE TABLE email_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "interviewId" uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  subject       text NOT NULL DEFAULT 'You''re invited to an interview: {{interview_title}}',
  body          text NOT NULL DEFAULT '',
  "logoUrl"     text,
  "replyTo"     text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("interviewId")
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- email_send_logs: track every email sent
CREATE TABLE email_send_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "interviewId"    uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  "candidateId"    uuid REFERENCES candidates(id) ON DELETE SET NULL,
  "recipientEmail" text NOT NULL,
  "recipientName"  text,
  subject          text NOT NULL,
  status           text NOT NULL DEFAULT 'SENT',
  "errorMessage"   text,
  "messageId"      text,
  "sentAt"         timestamptz NOT NULL DEFAULT now(),
  "sentBy"         uuid NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX idx_email_send_logs_interview ON email_send_logs ("interviewId");
CREATE INDEX idx_email_send_logs_candidate ON email_send_logs ("candidateId");

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE email_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_send_logs  ENABLE ROW LEVEL SECURITY;

-- email_templates: same access as the parent interview
CREATE POLICY "Email templates readable by interview owner"
  ON email_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = email_templates."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Interview owners can insert email templates"
  ON email_templates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = email_templates."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Interview owners can update email templates"
  ON email_templates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = email_templates."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = email_templates."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Interview owners can delete email templates"
  ON email_templates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = email_templates."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );

-- email_send_logs: readable by interview owner
CREATE POLICY "Email send logs readable by interview owner"
  ON email_send_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = email_send_logs."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Interview owners can insert email send logs"
  ON email_send_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = email_send_logs."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );
