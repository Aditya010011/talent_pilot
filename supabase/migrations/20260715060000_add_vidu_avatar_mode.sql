-- Allow Premium Vidu S1 realtime avatar mode
ALTER TABLE public."interviews" DROP CONSTRAINT IF EXISTS "interviews_avatarMode_check";
ALTER TABLE public."interviews"
  ADD CONSTRAINT "interviews_avatarMode_check"
  CHECK ("avatarMode" IN ('none', 'static', 'simli', 'vidu'));
