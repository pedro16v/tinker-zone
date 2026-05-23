-- M4: batching. Group live_patches into batches that become real git commits via the
-- existing claude-bake automation. The bake-trigger workflow polls claim_batch on a cron;
-- when a batch is claimed it opens a GitHub issue (labeled `bake`) and the bake fires.

-- ---- batches: one row per group of live patches that will be baked together ----
create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'open' check (
    status in ('open','issued','building','deployed','failed')
  ),
  github_issue int,
  github_pr int,
  deploy_id text,
  deploy_url text,
  deployed_at timestamptz,
  error text
);

create index if not exists batches_status_idx on public.batches (status);

-- ---- live_patches: which batch (if any) + the originating user prompt ----
alter table public.live_patches add column if not exists prompt text;
alter table public.live_patches add column if not exists batch_id uuid references public.batches(id);

create index if not exists live_patches_batch_idx on public.live_patches (batch_id);

-- ---- atomic batch claim ----
-- Bake when (a) at least p_min_count un-baked patches exist OR (b) the oldest is older than
-- p_max_age_seconds. Returns jsonb {batch_id, count, items:[{seq,prompt,patch}]} or NULL.
-- Only one batch may be in flight at a time (status in 'open'/'issued'/'building').
create or replace function public.claim_batch(p_min_count int default 3, p_max_age_seconds int default 1800)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_count int;
  v_oldest timestamptz;
  v_payload jsonb;
begin
  if exists (select 1 from public.batches where status in ('open','issued','building')) then
    return null;
  end if;

  select count(*), min(created_at)
    into v_count, v_oldest
    from public.live_patches
    where status = 'live' and batch_id is null;

  if v_count = 0 then
    return null;
  end if;

  if v_count < p_min_count
     and (v_oldest is null or v_oldest > now() - make_interval(secs => p_max_age_seconds))
  then
    return null;
  end if;

  v_batch_id := gen_random_uuid();
  insert into public.batches (id, status) values (v_batch_id, 'open');

  update public.live_patches
    set batch_id = v_batch_id, status = 'baking'
    where status = 'live' and batch_id is null;

  select jsonb_build_object(
           'batch_id', v_batch_id,
           'count', count(*),
           'items', coalesce(jsonb_agg(
                      jsonb_build_object('seq', seq, 'prompt', prompt, 'patch', patch)
                      order by seq
                    ), '[]'::jsonb)
         )
    into v_payload
    from public.live_patches
    where batch_id = v_batch_id;

  return v_payload;
end;
$$;

revoke all on function public.claim_batch(int, int) from public;

-- ---- fail_batch: release a batch's patches back to 'live' if the bake couldn't start ----
create or replace function public.fail_batch(p_batch_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.batches
    set status = 'failed', error = p_error
    where id = p_batch_id;

  update public.live_patches
    set status = 'live', batch_id = null
    where batch_id = p_batch_id and status = 'baking';
end;
$$;

revoke all on function public.fail_batch(uuid, text) from public;

-- ---- broadcast a {type:'reset', deploy_id} message after a bake deploy lands ----
-- live-layer.js reacts by reloading canonical (dropping baked ephemeral patches).
create or replace function public.tz_broadcast_reset(p_deploy_id text)
returns void
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  perform realtime.send(
    jsonb_build_object('type', 'reset', 'deploy_id', p_deploy_id),
    'reset',
    'tz:live',
    false
  );
end;
$$;

revoke all on function public.tz_broadcast_reset(text) from public;
