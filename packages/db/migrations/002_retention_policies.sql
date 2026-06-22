-- Markov v3: Audit Log Retention Policy
-- Auto-purge audit logs older than retention period
-- NOTE: These functions should ONLY be called via service_role (bypasses RLS)
-- To revoke execute from regular users: REVOKE EXECUTE ON FUNCTION purge_old_audit_logs FROM authenticated, anon;

-- Create a function to purge old audit logs (service_role only)
create or replace function purge_old_audit_logs(retention_days integer default 365)
returns void as $$
begin
  delete from audit_logs
  where created_at < now() - (retention_days || ' days')::interval;
end;
$$ language plpgsql security definer;

-- Revoke from regular users — only service_role should call this
revoke execute on function purge_old_audit_logs(integer) from authenticated, anon;

-- Create a function to purge old student images (service_role only)
create or replace function purge_old_images(retention_days integer default 30)
returns void as $$
begin
  -- In production, this would delete from Supabase Storage
  -- For now, just log the action
  insert into audit_logs (correlation_id, action, entity_type, metadata)
  values (
    gen_random_uuid(),
    'system.image_purge',
    'image',
    jsonb_build_object('retention_days', retention_days, 'purged_at', now())
  );
end;
$$ language plpgsql security definer;

-- Revoke from regular users
revoke execute on function purge_old_images(integer) from authenticated, anon;
