-- LINE連携用カラム追加
ALTER TABLE students ADD COLUMN IF NOT EXISTS line_user_id TEXT;
ALTER TABLE schools  ADD COLUMN IF NOT EXISTS owner_line_user_id TEXT;

-- students: line_user_id にインデックス（重複チェック用）
CREATE UNIQUE INDEX IF NOT EXISTS students_line_user_id_key
  ON students (line_user_id)
  WHERE line_user_id IS NOT NULL;
