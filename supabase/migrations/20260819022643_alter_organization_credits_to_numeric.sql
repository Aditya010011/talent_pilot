ALTER TABLE public.organizations
  ALTER COLUMN credits TYPE numeric(10,2) USING credits::numeric;

ALTER TABLE public.credit_rates
  ALTER COLUMN credits TYPE numeric(10,2) USING credits::numeric;
