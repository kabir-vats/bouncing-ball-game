# Stage 6 Random Run Rankings

Random runs submit verified scores to a global score table. Challenge, daily, and explicit seed-link runs are not submitted.

Run this SQL in Supabase:

```sql
create table if not exists public.random_scores (
  id uuid primary key default gen_random_uuid(),
  player_id text not null check (length(player_id) <= 128),
  seed bigint not null check (seed >= 0),
  score integer not null check (score >= 0),
  max_score integer not null check (max_score >= 0),
  run_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists random_scores_rank_idx
  on public.random_scores (score desc, created_at asc);

create index if not exists random_scores_player_idx
  on public.random_scores (player_id, created_at desc);

create or replace function public.submit_random_score(
  p_player_id text,
  p_seed bigint,
  p_score integer,
  p_max_score integer,
  p_run_json jsonb
)
returns table (
  id uuid,
  rank bigint,
  total bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if p_player_id is null
    or length(p_player_id) = 0
    or length(p_player_id) > 128
    or p_seed is null
    or p_seed < 0
    or p_score is null
    or p_score < 0
    or p_max_score is null
    or p_max_score < 0
  then
    raise exception 'Invalid random score payload';
  end if;

  insert into public.random_scores as inserted (player_id, seed, score, max_score, run_json)
  values (p_player_id, p_seed, p_score, p_max_score, coalesce(p_run_json, '[]'::jsonb))
  returning inserted.id into inserted_id;

  return query
  select
    inserted_id,
    (select count(*) + 1 from public.random_scores where random_scores.score > p_score)::bigint,
    (select count(*) from public.random_scores)::bigint;
end;
$$;

grant usage on schema public to service_role;
grant all privileges on table public.random_scores to service_role;
grant execute on function public.submit_random_score(text, bigint, integer, integer, jsonb) to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;

notify pgrst, 'reload schema';
```

Notes:

- The API endpoint is `POST /api/random-scores`.
- The API recomputes the submitted score server-side from `seed` and `guesses` before calling `submit_random_score`.
- Ranking is score-only. Equal scores share the same rank because rank is `count(scores greater than yours) + 1`.
- Random score submission is rate-limited to 60 requests per IP per minute. Run `docs/rate-limits.sql` before relying on production limits.
- The final score screen shows `Global rank #x / #y`. If the API/database cannot be reached, it shows `Failed to connect to server`.
