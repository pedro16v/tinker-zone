-- M3: per-IP rate limiting used by the /submit Edge function. Bucketed by a configurable
-- window; the function call increments + checks atomically. Anon never calls this directly —
-- only the service role (from inside /submit) does.

create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

create or replace function public.rate_check(p_key text, p_limit int, p_window_seconds int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz := to_timestamp(
    (extract(epoch from now())::bigint / p_window_seconds) * p_window_seconds
  );
  v_count int;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1;

  select count into v_count
    from public.rate_limits
    where key = p_key and window_start = v_window_start;

  if v_count > p_limit then
    raise exception 'rate limit exceeded';
  end if;
end;
$$;

revoke all on function public.rate_check(text, int, int) from public;
