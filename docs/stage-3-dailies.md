# Stage 3 Daily Challenge Setup

Daily challenges use the same Vercel API and Supabase service role environment variables as shareable challenges.

Run this SQL in Supabase:

```sql
create table if not exists public.daily_boards (
  date date primary key,
  seed bigint not null,
  generator_version text not null default 'stage-3',
  physics_version text not null default 'stage-3',
  scoring_version text not null default 'stage-3',
  created_at timestamptz not null default now()
);

create table if not exists public.daily_scores (
  id uuid primary key default gen_random_uuid(),
  daily_date date not null references public.daily_boards(date) on delete cascade,
  player_id text not null,
  initials text not null check (
    initials ~ '^[A-Z]{1,3}$'
    and initials not in ('ASS', 'CUM', 'KKK', 'NZI', 'SEX', 'TIT', 'XXX')
    and initials !~ '^(F.G|F.K|N.G|S.X)$'
  ),
  score integer not null check (score >= 0),
  max_score integer not null check (max_score >= 0),
  run_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (daily_date, player_id)
);

create index if not exists daily_scores_rank_idx
  on public.daily_scores (daily_date, score desc, created_at asc);

grant usage on schema public to service_role;
grant all privileges on table public.daily_boards to service_role;
grant all privileges on table public.daily_scores to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;

notify pgrst, 'reload schema';
```

Notes:

- The daily date is UTC, so everyone gets the same board.
- The API creates a `daily_boards` row lazily the first time that date is opened.
- One official attempt per browser is stored in localStorage.
- Supabase also rejects duplicate daily scores per `player_id` through the unique constraint.
- The API recomputes submitted daily scores from the daily seed and submitted guesses before storing leaderboard entries.
- If your database already has the older exactly-3-character initials check, run `docs/initials-1-to-3-migration.sql` in Supabase.
- Streak count and “played today” are local browser state for now.
