CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id),
  student_id uuid REFERENCES public.students(id),
  amount integer NOT NULL,
  currency text DEFAULT 'jpy',
  status text DEFAULT 'pending',
  stripe_payment_intent_id text,
  description text,
  due_date date,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select" ON public.payments
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM public.school_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT WITH CHECK (
    school_id IN (
      SELECT school_id FROM public.school_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "payments_update" ON public.payments
  FOR UPDATE USING (
    school_id IN (
      SELECT school_id FROM public.school_members
      WHERE user_id = auth.uid()
    )
  );
