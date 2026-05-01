-- Allows leaderboard initials to be 1-3 uppercase letters instead of exactly 3 characters.
-- Run this once in the Supabase SQL editor.

alter table public.challenges
  drop constraint if exists challenges_creator_initials_check;

alter table public.challenge_scores
  drop constraint if exists challenge_scores_initials_check;

alter table public.daily_scores
  drop constraint if exists daily_scores_initials_check;

update public.challenges
set creator_initials = left(regexp_replace(upper(creator_initials), '[^A-Z]', '', 'g'), 3);

update public.challenge_scores
set initials = left(regexp_replace(upper(initials), '[^A-Z]', '', 'g'), 3);

update public.daily_scores
set initials = left(regexp_replace(upper(initials), '[^A-Z]', '', 'g'), 3);

update public.challenges
set creator_initials = 'PLY'
where creator_initials !~ '^[A-Z]{1,3}$'
  or creator_initials in ('ASS', 'CUM', 'KKK', 'NZI', 'SEX', 'TIT', 'XXX')
  or creator_initials ~ '^(F.G|F.K|N.G|S.X)$';

update public.challenge_scores
set initials = 'PLY'
where initials !~ '^[A-Z]{1,3}$'
  or initials in ('ASS', 'CUM', 'KKK', 'NZI', 'SEX', 'TIT', 'XXX')
  or initials ~ '^(F.G|F.K|N.G|S.X)$';

update public.daily_scores
set initials = 'PLY'
where initials !~ '^[A-Z]{1,3}$'
  or initials in ('ASS', 'CUM', 'KKK', 'NZI', 'SEX', 'TIT', 'XXX')
  or initials ~ '^(F.G|F.K|N.G|S.X)$';

alter table public.challenges
  add constraint challenges_creator_initials_check
  check (
    creator_initials ~ '^[A-Z]{1,3}$'
    and creator_initials not in ('ASS', 'CUM', 'KKK', 'NZI', 'SEX', 'TIT', 'XXX')
    and creator_initials !~ '^(F.G|F.K|N.G|S.X)$'
  );

alter table public.challenge_scores
  add constraint challenge_scores_initials_check
  check (
    initials ~ '^[A-Z]{1,3}$'
    and initials not in ('ASS', 'CUM', 'KKK', 'NZI', 'SEX', 'TIT', 'XXX')
    and initials !~ '^(F.G|F.K|N.G|S.X)$'
  );

alter table public.daily_scores
  add constraint daily_scores_initials_check
  check (
    initials ~ '^[A-Z]{1,3}$'
    and initials not in ('ASS', 'CUM', 'KKK', 'NZI', 'SEX', 'TIT', 'XXX')
    and initials !~ '^(F.G|F.K|N.G|S.X)$'
  );

notify pgrst, 'reload schema';
