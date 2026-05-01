-- Durable API rate limits for Vercel serverless functions.
-- Run this once in the Supabase SQL editor.

create table if not exists public.api_rate_limits (
  bucket text not null,
  key_hash text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket, key_hash, window_start)
);

create index if not exists api_rate_limits_updated_idx
  on public.api_rate_limits (updated_at);

create or replace function public.hit_rate_limit(
  p_bucket text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
  v_reset_at timestamptz;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit configuration';
  end if;

  v_window_start :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.api_rate_limits (bucket, key_hash, window_start, count, updated_at)
  values (p_bucket, p_key_hash, v_window_start, 1, now())
  on conflict (bucket, key_hash, window_start)
  do update set
    count = public.api_rate_limits.count + 1,
    updated_at = now()
  returning count into v_count;

  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(0, p_limit - v_count),
    'reset_at', v_reset_at
  );
end;
$$;

grant usage on schema public to service_role;
grant all privileges on table public.api_rate_limits to service_role;
grant execute on function public.hit_rate_limit(text, text, integer, integer) to service_role;

-- Optional cleanup job query; run manually or schedule in Supabase if desired.
-- delete from public.api_rate_limits where updated_at < now() - interval '2 days';

notify pgrst, 'reload schema';
