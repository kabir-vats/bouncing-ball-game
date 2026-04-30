# Stage 2 Challenge Setup

The challenge flow lives in this repo, but production leaderboards need a shared database.

## Recommended Deployment

- Deploy the Vite app and `api/` serverless functions on Vercel.
- Create a Supabase project.
- Add these environment variables to Vercel:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

The frontend is API-first and falls back to local storage during development if the API/database is unavailable. Local fallback is useful for UI testing, but it is not shared between browsers.

## Supabase Schema

Run this SQL in Supabase:

```sql
create table if not exists public.challenges (
  slug text primary key,
  seed bigint not null,
  creator_player_id text not null,
  creator_initials text not null check (char_length(creator_initials) between 1 and 3),
  creator_score integer not null check (creator_score >= 0),
  generator_version text not null default 'stage-2',
  physics_version text not null default 'stage-2',
  scoring_version text not null default 'stage-2',
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_scores (
  id uuid primary key default gen_random_uuid(),
  challenge_slug text not null references public.challenges(slug) on delete cascade,
  player_id text not null,
  initials text not null check (char_length(initials) between 1 and 3),
  score integer not null check (score >= 0),
  max_score integer not null check (max_score >= 0),
  run_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (challenge_slug, player_id)
);

create index if not exists challenge_scores_rank_idx
  on public.challenge_scores (challenge_slug, score desc, created_at asc);

grant usage on schema public to service_role;
grant all privileges on table public.challenges to service_role;
grant all privileges on table public.challenge_scores to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;

notify pgrst, 'reload schema';
```

## Current Security Model

- One official attempt per browser is enforced with local storage.
- The API also prevents duplicate scores per `player_id` per challenge.
- No sign-in is required, so determined users can replay in a different browser or clear storage.
- The API stores the submitted run payload. A later hardening pass should recompute scores server-side from the seed and turns before accepting leaderboard entries.

## Share URL Flow

- App-created challenge links use `/c/:slug`.
- Vercel rewrites `/c/:slug` to `/api/share/:slug`.
- The share endpoint returns Open Graph tags and an OG image URL, then redirects real players to `/?challenge=:slug`.
- The app loads the challenge by slug and starts the same seeded board.
