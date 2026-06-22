-- Markov v3: Row Level Security Policies
-- Defense-in-depth: RLS + application-level auth

-- ─── Enable RLS ────────────────────────────────────────────────
alter table profiles enable row level security;
alter table rubrics enable row level security;
alter table submissions enable row level security;
alter table audit_logs enable row level security;

-- ─── Profiles ──────────────────────────────────────────────────
-- Users can read their own profile
create policy "profiles_select_own"
  on profiles for select
  using (auth.uid() = id);

-- Teachers/Admins can read all profiles in their school
create policy "profiles_select_school"
  on profiles for select
  using (
    role in ('teacher', 'admin')
    and school_id = (select school_id from profiles where id = auth.uid())
  );

-- Users can update their own profile (limited columns)
create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ─── Rubrics ───────────────────────────────────────────────────
-- Teachers can read their own rubrics
create policy "rubrics_select_own"
  on rubrics for select
  using (teacher_id = auth.uid());

-- Students can read active rubrics for their school (to see what they're graded on)
create policy "rubrics_select_active"
  on rubrics for select
  using (
    is_active = true
    and (
      teacher_id = auth.uid()
      or exists (
        select 1 from profiles p
        where p.id = auth.uid()
        and p.school_id = (select school_id from profiles where id = rubrics.teacher_id)
      )
    )
  );

-- Teachers can create rubrics
create policy "rubrics_insert_teacher"
  on rubrics for insert
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and role = 'teacher')
  );

-- Teachers can update their own rubrics
create policy "rubrics_update_own"
  on rubrics for update
  using (teacher_id = auth.uid());

-- Teachers can delete their own rubrics
create policy "rubrics_delete_own"
  on rubrics for delete
  using (teacher_id = auth.uid());

-- ─── Submissions ───────────────────────────────────────────────
-- Students can read their own submissions
create policy "submissions_select_own"
  on submissions for select
  using (student_id = auth.uid());

-- Teachers can read submissions for rubrics they own
create policy "submissions_select_teacher_rubric"
  on submissions for select
  using (
    exists (
      select 1 from rubrics
      where rubrics.id = submissions.rubric_id
      and rubrics.teacher_id = auth.uid()
    )
  );

-- Students can create submissions (upload their work)
create policy "submissions_insert_student"
  on submissions for insert
  with check (student_id = auth.uid());

-- Admins can update submission status (service_role bypasses RLS entirely)
create policy "submissions_update_admin"
  on submissions for update
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ─── Audit Logs (INSERT ONLY) ──────────────────────────────────
-- Only admins can insert audit logs via RLS; service_role bypasses RLS
create policy "audit_logs_insert_admin"
  on audit_logs for insert
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Nobody can update or delete audit logs (immutable)
-- No UPDATE or DELETE policies = RLS blocks all mutations

-- Admins can read audit logs
create policy "audit_logs_select_admin"
  on audit_logs for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );
