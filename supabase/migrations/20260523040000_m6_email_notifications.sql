-- M6: per-submission email notifications. We store emails in a SEPARATE table (no anon RLS
-- policy = anon cannot read it) so the public time-machine query can't leak addresses.

create table if not exists public.notification_emails (
  id uuid primary key default gen_random_uuid(),
  live_patch_id uuid not null references public.live_patches(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delete_after timestamptz not null default (now() + interval '30 days')
);

create index if not exists notification_emails_live_patch_idx
  on public.notification_emails (live_patch_id);

-- RLS enabled but no anon policy: anon cannot see any row. service_role bypasses RLS.
alter table public.notification_emails enable row level security;

-- Periodic purge: any row older than its delete_after (default 30d) is deleted regardless
-- of send state. Called from a daily cron.
create or replace function public.purge_expired_emails()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.notification_emails where delete_after < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_expired_emails() from public;
