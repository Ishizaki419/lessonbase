CREATE TABLE IF NOT EXISTS public.payment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id),
  student_id uuid REFERENCES public.students(id),
  billing_type text NOT NULL DEFAULT 'monthly',
  amount integer NOT NULL,
  billing_day integer DEFAULT 1,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_settings_select" ON public.payment_settings
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM public.school_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "payment_settings_insert" ON public.payment_settings
  FOR INSERT WITH CHECK (
    school_id IN (
      SELECT school_id FROM public.school_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "payment_settings_update" ON public.payment_settings
  FOR UPDATE USING (
    school_id IN (
      SELECT school_id FROM public.school_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "payment_settings_delete" ON public.payment_settings
  FOR DELETE USING (
    school_id IN (
      SELECT school_id FROM public.school_members
      WHERE user_id = auth.uid()
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS payment_settings_school_student_unique
  ON public.payment_settings (school_id, student_id);
