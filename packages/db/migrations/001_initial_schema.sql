-- Markov v3: Initial Schema
-- Run with: supabase db push

-- ─── Profiles ──────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('student', 'teacher', 'admin')),
  display_name text,
  school_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Rubrics ───────────────────────────────────────────────────
create table if not exists rubrics (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  criteria jsonb not null default '[]'::jsonb,
  grading_instructions text,
  total_points integer not null check (total_points > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Submissions ───────────────────────────────────────────────
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  rubric_id uuid not null references rubrics(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'ocr_processing', 'ocr_complete', 'ocr_requires_review', 'grading', 'graded', 'error')),
  image_url text not null,
  image_hash text not null,
  ocr_blocks jsonb not null default '[]'::jsonb,
  raw_ocr_text text,
  grade_result jsonb,
  requires_review boolean not null default false,
  review_notes text,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Audit Logs (Immutable) ───────────────────────────────────
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);

-- ─── Indexes ───────────────────────────────────────────────────
create index if not exists idx_submissions_student on submissions(student_id);
create index if not exists idx_submissions_status on submissions(status);
create index if not exists idx_submissions_rubric on submissions(rubric_id);
create index if not exists idx_submissions_image_hash on submissions(image_hash);
create index if not exists idx_rubrics_teacher on rubrics(teacher_id);
create index if not exists idx_audit_logs_correlation on audit_logs(correlation_id);
create index if not exists idx_audit_logs_actor on audit_logs(actor_id);
create index if not exists idx_audit_logs_action on audit_logs(action);
create index if not exists idx_audit_logs_created on audit_logs(created_at);
create index if not exists idx_audit_logs_entity on audit_logs(entity_type, entity_id);

-- ─── Updated_at trigger ────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

drop trigger if exists rubrics_updated_at on rubrics;
create trigger rubrics_updated_at
  before update on rubrics
  for each row execute function update_updated_at();

drop trigger if exists submissions_updated_at on submissions;
create trigger submissions_updated_at
  before update on submissions
  for each row execute function update_updated_at();
