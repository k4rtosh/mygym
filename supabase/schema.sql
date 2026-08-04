-- MyGym schema + RLS
-- Run in Supabase SQL Editor (schema first, then seed_exercises.sql)

create extension if not exists "pgcrypto";

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  birth_date date,
  coach_goal jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Exercise catalog (shared read-only for authenticated users)
create table if not exists public.exercises (
  id text primary key,
  name text not null,
  category text not null default '',
  muscle text not null default '',
  type text not null default '',
  description text not null default ''
);

alter table public.exercises enable row level security;

create policy "exercises_select_auth"
  on public.exercises for select
  to authenticated
  using (true);

-- Workout templates (exercises stored as jsonb to match app shape)
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'Новый шаблон',
  description text not null default '',
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_user_id_idx on public.templates (user_id);

alter table public.templates enable row level security;

create policy "templates_select_own"
  on public.templates for select
  using (auth.uid() = user_id);

create policy "templates_insert_own"
  on public.templates for insert
  with check (auth.uid() = user_id);

create policy "templates_update_own"
  on public.templates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "templates_delete_own"
  on public.templates for delete
  using (auth.uid() = user_id);

-- Completed / in-progress sessions
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid references public.templates (id) on delete set null,
  template_name text not null default 'Свободная тренировка',
  workout_date date not null,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  duration_sec int not null default 0,
  completed boolean not null default false,
  notes text not null default '',
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_id_idx on public.sessions (user_id);
create index if not exists sessions_user_date_idx on public.sessions (user_id, workout_date);

-- At most one completed session per user per day
create unique index if not exists sessions_one_completed_per_day
  on public.sessions (user_id, workout_date)
  where completed = true;

alter table public.sessions enable row level security;

create policy "sessions_select_own"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "sessions_insert_own"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "sessions_update_own"
  on public.sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "sessions_delete_own"
  on public.sessions for delete
  using (auth.uid() = user_id);

-- Planned workouts: 1 day = 1 plan
create table if not exists public.planned_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workout_date date not null,
  template_id uuid references public.templates (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, workout_date)
);

create index if not exists planned_workouts_user_id_idx on public.planned_workouts (user_id);

alter table public.planned_workouts enable row level security;

create policy "planned_select_own"
  on public.planned_workouts for select
  using (auth.uid() = user_id);

create policy "planned_insert_own"
  on public.planned_workouts for insert
  with check (auth.uid() = user_id);

create policy "planned_update_own"
  on public.planned_workouts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "planned_delete_own"
  on public.planned_workouts for delete
  using (auth.uid() = user_id);

-- Body weight history (one entry per user per calendar day)
create table if not exists public.body_weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  weight_kg numeric(5, 2) not null
    check (weight_kg > 0 and weight_kg < 500),
  measured_on date not null default (current_date),
  session_id uuid references public.sessions (id) on delete set null,
  source text not null default 'workout_end'
    check (source in ('onboarding', 'workout_end')),
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

create index if not exists body_weight_entries_user_id_idx
  on public.body_weight_entries (user_id);

create index if not exists body_weight_entries_user_date_idx
  on public.body_weight_entries (user_id, measured_on);

alter table public.body_weight_entries enable row level security;

create policy "body_weight_select_own"
  on public.body_weight_entries for select
  using (auth.uid() = user_id);

create policy "body_weight_insert_own"
  on public.body_weight_entries for insert
  with check (auth.uid() = user_id);

create policy "body_weight_update_own"
  on public.body_weight_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "body_weight_delete_own"
  on public.body_weight_entries for delete
  using (auth.uid() = user_id);
