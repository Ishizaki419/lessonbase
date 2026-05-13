-- 教室単位のマルチテナント（schools / school_members / school_id）
-- 注意: 元の仕様にあった誤りを修正しています。
--   bookings.school_id は REFERENCES schools(id) です（bookings ではありません）。

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.school_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'staff',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_school_members_user_id ON public.school_members (user_id);
CREATE INDEX IF NOT EXISTS idx_school_members_school_id ON public.school_members (school_id);

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools (id);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools (id);

CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students (school_id);
CREATE INDEX IF NOT EXISTS idx_bookings_school_id ON public.bookings (school_id);

-- ---------------------------------------------------------------------------
-- 招待用 RPC（メールで既存ユーザーを検索して school_members に追加）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invite_school_member (p_school_id uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.schools s
    WHERE s.id = p_school_id
      AND s.owner_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT u.id INTO v_target
  FROM auth.users u
  WHERE lower(trim(u.email::text)) = lower(trim(p_email))
  LIMIT 1;

  IF v_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  IF v_target = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_invite_self');
  END IF;

  INSERT INTO public.school_members (school_id, user_id, role)
  VALUES (p_school_id, v_target, 'staff')
  ON CONFLICT (school_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.invite_school_member (uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_school_member (uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: schools
-- ---------------------------------------------------------------------------

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schools_select_member" ON public.schools;
CREATE POLICY "schools_select_member" ON public.schools
  FOR SELECT
  USING (
    id IN (SELECT sm.school_id FROM public.school_members sm WHERE sm.user_id = auth.uid())
    OR owner_id = auth.uid()
  );

DROP POLICY IF EXISTS "schools_insert_owner" ON public.schools;
CREATE POLICY "schools_insert_owner" ON public.schools
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "schools_update_owner" ON public.schools;
CREATE POLICY "schools_update_owner" ON public.schools
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: school_members
-- ---------------------------------------------------------------------------

ALTER TABLE public.school_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_members_select" ON public.school_members;
CREATE POLICY "school_members_select" ON public.school_members
  FOR SELECT
  USING (
    school_id IN (SELECT sm.school_id FROM public.school_members sm WHERE sm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "school_members_insert_owner" ON public.school_members;
CREATE POLICY "school_members_insert_owner" ON public.school_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.schools s
      WHERE s.id = school_id
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "school_members_delete_owner" ON public.school_members;
CREATE POLICY "school_members_delete_owner" ON public.school_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.schools s
      WHERE s.id = school_members.school_id
        AND s.owner_id = auth.uid()
    )
    AND user_id <> auth.uid()
  );

-- ---------------------------------------------------------------------------
-- RLS: students / bookings（所属教室のデータのみ）
-- ---------------------------------------------------------------------------

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "教室メンバーのみ" ON public.students;
DROP POLICY IF EXISTS "students_select" ON public.students;
DROP POLICY IF EXISTS "students_insert" ON public.students;
DROP POLICY IF EXISTS "students_update" ON public.students;
DROP POLICY IF EXISTS "students_delete" ON public.students;

CREATE POLICY "students_select" ON public.students
  FOR SELECT
  USING (
    school_id IN (SELECT sm.school_id FROM public.school_members sm WHERE sm.user_id = auth.uid())
  );

CREATE POLICY "students_insert" ON public.students
  FOR INSERT
  WITH CHECK (
    school_id IN (SELECT sm.school_id FROM public.school_members sm WHERE sm.user_id = auth.uid())
  );

CREATE POLICY "students_update" ON public.students
  FOR UPDATE
  USING (
    school_id IN (SELECT sm.school_id FROM public.school_members sm WHERE sm.user_id = auth.uid())
  )
  WITH CHECK (
    school_id IN (SELECT sm.school_id FROM public.school_members sm WHERE sm.user_id = auth.uid())
  );

CREATE POLICY "students_delete" ON public.students
  FOR DELETE
  USING (
    school_id IN (SELECT sm.school_id FROM public.school_members sm WHERE sm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "教室メンバーのみ" ON public.bookings;
DROP POLICY IF EXISTS "bookings_select" ON public.bookings;
DROP POLICY IF EXISTS "bookings_insert" ON public.bookings;
DROP POLICY IF EXISTS "bookings_update" ON public.bookings;
DROP POLICY IF EXISTS "bookings_delete" ON public.bookings;

CREATE POLICY "bookings_select" ON public.bookings
  FOR SELECT
  USING (
    school_id IN (SELECT sm.school_id FROM public.school_members sm WHERE sm.user_id = auth.uid())
  );

CREATE POLICY "bookings_insert" ON public.bookings
  FOR INSERT
  WITH CHECK (
    school_id IN (SELECT sm.school_id FROM public.school_members sm WHERE sm.user_id = auth.uid())
  );

CREATE POLICY "bookings_update" ON public.bookings
  FOR UPDATE
  USING (
    school_id IN (SELECT sm.school_id FROM public.school_members sm WHERE sm.user_id = auth.uid())
  )
  WITH CHECK (
    school_id IN (SELECT sm.school_id FROM public.school_members sm WHERE sm.user_id = auth.uid())
  );

CREATE POLICY "bookings_delete" ON public.bookings
  FOR DELETE
  USING (
    school_id IN (SELECT sm.school_id FROM public.school_members sm WHERE sm.user_id = auth.uid())
  );
