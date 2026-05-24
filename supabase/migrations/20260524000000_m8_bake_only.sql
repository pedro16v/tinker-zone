-- M8: bake-only fallback. Some prompts can't be expressed in the live vocabulary
-- (interactive behavior, JS event handlers, animations needing the full canvas/scripts/
-- expressiveness, multi-property layouts) but ARE perfectly reasonable creative requests
-- that the bake step can implement.
--
-- Previously these were dropped on the floor when patchgen threw or the validator rejected.
-- Now they're inserted with status='bake_only' (patch nullable) — not broadcast, but
-- claimed by the next bake batch alongside live patches. The bake issue body describes
-- them as "implement from scratch" since there's no live patch to anchor on.

-- Allow the new status. CHECK constraints can't be ALTERed, so drop + recreate.
alter table public.live_patches
  drop constraint if exists live_patches_status_check;

alter table public.live_patches
  add constraint live_patches_status_check
  check (status in ('live', 'bake_only', 'baking', 'baked', 'reverted'));

-- A bake-only row carries the prompt but no patch.
alter table public.live_patches
  alter column patch drop not null;

-- The broadcast trigger must only fan out actual live patches. bake_only rows are
-- silent to subscribers — they exist purely to ride into the next batch.
create or replace function public.tz_broadcast_patch()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  if NEW.status <> 'live' then
    return NEW;
  end if;
  perform realtime.send(
    jsonb_build_object('type', 'patch', 'seq', NEW.seq, 'patch', NEW.patch, 'id', NEW.id),
    'patch',
    'tz:live',
    false
  );
  return NEW;
end;
$$;

-- claim_batch now scoops up both 'live' and 'bake_only' rows. The bake actor can tell them
-- apart by the patch field being null for bake_only.
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
    where status in ('live', 'bake_only') and batch_id is null;

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
    where status in ('live', 'bake_only') and batch_id is null;

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
