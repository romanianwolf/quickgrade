-- ============================================
-- QuickGrade v3 Database Schema with RLS
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── SUBMISSIONS ─────────────────────────────
CREATE TABLE submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID,
  student_id UUID,
  page_number INTEGER DEFAULT 1 CHECK (page_number > 0 AND page_number <= 10),
  image_hash TEXT NOT NULL,
  ocr_text_encrypted TEXT,
  ocr_blocks JSONB DEFAULT '[]',
  requires_review BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','ocr_complete','ocr_requires_review','ocr_failed','graded','failed')),
  ocr_error TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  correlation_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_submissions_image_hash ON submissions(image_hash);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_created_at ON submissions(created_at);

-- ─── RUBRICS ─────────────────────────────────
CREATE TABLE rubrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  criteria JSONB NOT NULL DEFAULT '[]',
  created_by UUID,
  school_id UUID,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rubrics_created_by ON rubrics(created_by);
CREATE INDEX idx_rubrics_school_id ON rubrics(school_id);

-- ─── GRADES ──────────────────────────────────
CREATE TABLE grades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  rubric_id UUID REFERENCES rubrics(id) ON DELETE SET NULL,
  scores JSONB NOT NULL DEFAULT '[]',
  total_score NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_max_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  ai_model TEXT NOT NULL,
  ai_provider TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  processing_time_ms INTEGER NOT NULL DEFAULT 0,
  overall_feedback TEXT,
  used_answer_scheme BOOLEAN DEFAULT false,
  answer_source TEXT CHECK (answer_source IN ('provided','ai-knowledge','search')),
  reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_grades_submission_id ON grades(submission_id);
CREATE INDEX idx_grades_percentage ON grades(percentage);
CREATE INDEX idx_grades_created_at ON grades(created_at);

-- ─── AUDIT LOGS (IMMUTABLE) ──────────────────
CREATE TABLE audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID,
  action TEXT NOT NULL CHECK (action IN ('scan','grade','review','delete','login','export')),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  correlation_id UUID NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_correlation ON audit_logs(correlation_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ─── AUTO-UPDATE TRIGGER ─────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_submissions_updated_at
  BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rubrics_updated_at
  BEFORE UPDATE ON rubrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS: SUBMISSIONS ────────────────────────
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY submissions_insert_service ON submissions
  FOR INSERT WITH CHECK (true);

CREATE POLICY submissions_select_service ON submissions
  FOR SELECT USING (true);

CREATE POLICY submissions_update_service ON submissions
  FOR UPDATE USING (true);

-- ─── RLS: RUBRICS ────────────────────────────
ALTER TABLE rubrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY rubrics_insert_auth ON rubrics
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY rubrics_select_public ON rubrics
  FOR SELECT USING (is_public = true OR created_by = auth.uid());

CREATE POLICY rubrics_update_owner ON rubrics
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY rubrics_delete_owner ON rubrics
  FOR DELETE USING (created_by = auth.uid());

-- ─── RLS: GRADES ─────────────────────────────
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY grades_insert_service ON grades
  FOR INSERT WITH CHECK (true);

CREATE POLICY grades_select_service ON grades
  FOR SELECT USING (true);

CREATE POLICY grades_update_reviewer ON grades
  FOR UPDATE USING (true);

-- ─── RLS: AUDIT LOGS (INSERT ONLY) ───────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_insert_only ON audit_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY audit_select_admin ON audit_logs
  FOR SELECT USING (auth.jwt() ->> 'role' = 'admin');

-- NO UPDATE or DELETE policies = denied by default

-- ─── REVOKE EXECUTE ON PURGE FUNCTIONS ──────
CREATE OR REPLACE FUNCTION purge_old_submissions(days_old INTEGER DEFAULT 90)
RETURNS void AS $$
BEGIN
  DELETE FROM submissions WHERE created_at < NOW() - (days_old || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION purge_old_audit_logs(days_old INTEGER DEFAULT 365)
RETURNS void AS $$
BEGIN
  DELETE FROM audit_logs WHERE created_at < NOW() - (days_old || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke purge functions from regular users
REVOKE EXECUTE ON FUNCTION purge_old_submissions(INTEGER) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION purge_old_audit_logs(INTEGER) FROM authenticated, anon;