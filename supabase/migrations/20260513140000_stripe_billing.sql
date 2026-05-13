ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS billing_day integer DEFAULT 25;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS charged_at timestamptz;
