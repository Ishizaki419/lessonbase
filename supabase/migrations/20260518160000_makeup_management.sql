-- ────────────────────────────────────────────────────────────────
-- 振替管理システム
-- ────────────────────────────────────────────────────────────────

-- 先生の週次稼働時間（1回設定するだけ）
CREATE TABLE IF NOT EXISTS teacher_availability (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  day_of_week             int  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=日,1=月...6=土
  start_time              time NOT NULL,
  end_time                time NOT NULL,
  lesson_duration_minutes int  NOT NULL DEFAULT 60,
  created_at              timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS teacher_availability_school_day_key
  ON teacher_availability (school_id, day_of_week);

ALTER TABLE teacher_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members can manage availability"
  ON teacher_availability FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM school_members
      WHERE school_members.school_id = teacher_availability.school_id
        AND school_members.user_id = auth.uid()
    )
  );

-- 休校日
CREATE TABLE IF NOT EXISTS school_closed_days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  closed_date date NOT NULL,
  reason      text,
  created_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS school_closed_days_school_date_key
  ON school_closed_days (school_id, closed_date);

ALTER TABLE school_closed_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members can manage closed days"
  ON school_closed_days FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM school_members
      WHERE school_members.school_id = school_closed_days.school_id
        AND school_members.user_id = auth.uid()
    )
  );

-- 欠席記録
CREATE TABLE IF NOT EXISTS absences (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  original_booking_id uuid REFERENCES bookings(id),
  absence_date        date NOT NULL,
  reason              text,
  makeup_booking_id   uuid REFERENCES bookings(id),
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','scheduled','cancelled')),
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

-- 先生（school_members）はすべて操作可能
CREATE POLICY "school members can manage absences"
  ON absences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM school_members
      WHERE school_members.school_id = absences.school_id
        AND school_members.user_id = auth.uid()
    )
  );

-- 生徒は自分の欠席を挿入・参照のみ可能（LIFF経由）
-- ※ service_role キーで呼ぶAPIが代行するため anon/authenticated は不要だが念のため
CREATE POLICY "students can insert own absences"
  ON absences FOR INSERT
  WITH CHECK (true); -- API側でservice_roleを使用

-- bookings テーブルに振替フラグを追加
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_makeup   boolean DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS absence_id  uuid REFERENCES absences(id);
