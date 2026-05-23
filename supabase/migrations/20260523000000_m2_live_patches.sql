-- M2: Live-layer infrastructure.
-- A small control table the widget polls, the ephemeral live_patches table, and a Realtime
-- broadcast trigger so every approved live patch reaches all connected browsers instantly.

create extension if not exists pgcrypto;

-- ---- control: kill switch + tunables, polled by the widget ----
create table if not exists public.control (
  id int primary key default 1,
  submissions_open boolean not null default true,
  staging_mode boolean not null default false,
  spend_cap_cents int not null default 1000,
  updated_at timestamptz not null default now()
);
insert into public.control (id) values (1) on conflict do nothing;

alter table public.control enable row level security;
drop policy if exists "anon may read control" on public.control;
create policy "anon may read control"
  on public.control for select
  to anon
  using (true);

-- ---- live_patches: ephemeral, applied in every connected browser via Realtime ----
create table if not exists public.live_patches (
  id uuid primary key default gen_random_uuid(),
  seq bigserial unique not null,
  created_at timestamptz not null default now(),
  patch jsonb not null,
  status text not null default 'live' check (status in ('live','baking','baked','reverted')),
  baked_in_deploy text
);
create index if not exists live_patches_status_seq_idx on public.live_patches (status, seq);

alter table public.live_patches enable row level security;
-- Anon may read recent live patches (catch-up endpoint reads them). Writes happen only via
-- the service_role (the Supabase Edge function /submit), so no anon insert/update.
drop policy if exists "anon may read live patches" on public.live_patches;
create policy "anon may read live patches"
  on public.live_patches for select
  to anon
  using (true);

-- ---- broadcast trigger: send every inserted live patch to the public "tz:live" channel ----
create or replace function public.tz_broadcast_patch()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  perform realtime.send(
    jsonb_build_object('type', 'patch', 'seq', NEW.seq, 'patch', NEW.patch, 'id', NEW.id),
    'patch',
    'tz:live',
    false  -- public channel; anon can subscribe without auth
  );
  return NEW;
end;
$$;

drop trigger if exists trg_tz_broadcast_patch on public.live_patches;
create trigger trg_tz_broadcast_patch
  after insert on public.live_patches
  for each row execute function public.tz_broadcast_patch();
