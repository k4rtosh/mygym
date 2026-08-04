-- Coach inbox: dismissed card ids until next completed workout
alter table public.profiles
  add column if not exists coach_inbox jsonb;

comment on column public.profiles.coach_inbox is
  'Coach UI inbox: { asOfSessionId, dismissed[] } — cleared epoch after new workout';
