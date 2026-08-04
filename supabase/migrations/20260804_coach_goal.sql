-- Coach goal on profile (rule-coach layer 1)
alter table public.profiles
  add column if not exists coach_goal jsonb;

comment on column public.profiles.coach_goal is
  'Rule-coach goal: intent, mode, optional focusExerciseId, period, targetFrequency';
