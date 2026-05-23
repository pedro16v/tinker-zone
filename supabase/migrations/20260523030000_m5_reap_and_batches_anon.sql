-- M5: enable anon read on batches (time machine reads from it), and add reap_stuck_batches
-- which the bake-trigger cron calls to release batches stuck `issued`/`building` too long.

-- Allow the time machine page (anon role) to list deployed bakes.
alter table public.batches enable row level security;
drop policy if exists "anon may read batches" on public.batches;
create policy "anon may read batches"
  on public.batches for select
  to anon
  using (true);

-- Reap any batches that have been in flight longer than p_max_age_hours. Calls fail_batch
-- to release each one's patches back to 'live' so the next claim_batch can pick them up.
create or replace function public.reap_stuck_batches(p_max_age_hours int default 2)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select id from public.batches
    where status in ('open','issued','building')
      and created_at < now() - make_interval(hours => p_max_age_hours)
  loop
    perform public.fail_batch(r.id, format('reaped: stuck > %s hour(s)', p_max_age_hours));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.reap_stuck_batches(int) from public;
