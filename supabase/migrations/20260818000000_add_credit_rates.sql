-- System-wide interview credit rates (SYSTEM_ADMIN Project Settings).
-- Additive only: create table + seed defaults matching current 5 credits / 15 minutes.
-- Chat stays 0 so existing chat-only interviews remain free until edited.

CREATE TABLE IF NOT EXISTS public.credit_rates (
  "interviewType" text PRIMARY KEY,
  credits integer NOT NULL DEFAULT 5,
  minutes integer NOT NULL DEFAULT 15,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_rates_credits_nonneg CHECK (credits >= 0),
  CONSTRAINT credit_rates_minutes_pos CHECK (minutes > 0)
);

INSERT INTO public.credit_rates ("interviewType", credits, minutes)
VALUES
  ('realtime_avatar', 5, 15),
  ('voice_only', 5, 15),
  ('non_interactive', 5, 15),
  ('chat', 0, 15)
ON CONFLICT ("interviewType") DO NOTHING;

ALTER TABLE public.credit_rates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_rates'
      AND policyname = 'Anyone can read credit rates'
  ) THEN
    CREATE POLICY "Anyone can read credit rates"
      ON public.credit_rates FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_rates'
      AND policyname = 'System admin can manage credit rates'
  ) THEN
    CREATE POLICY "System admin can manage credit rates"
      ON public.credit_rates FOR ALL
      TO authenticated
      USING (
        (SELECT email FROM public.profiles WHERE id = auth.uid()) = 'info@inluwa.com'
      )
      WITH CHECK (
        (SELECT email FROM public.profiles WHERE id = auth.uid()) = 'info@inluwa.com'
      );
  END IF;
END $$;

GRANT SELECT ON TABLE public.credit_rates TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.credit_rates TO authenticated;
GRANT ALL ON TABLE public.credit_rates TO service_role;

NOTIFY pgrst, 'reload schema';
