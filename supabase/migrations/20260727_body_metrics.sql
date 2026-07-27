-- MyGym 2.6.0 — body metrics & profile birth date
-- Run in Supabase SQL Editor after schema.sql (existing projects).

-- Date of birth on profile (set once from the app; age is derived client-side)
alter table public.profiles
  add column if not exists birth_date date;

comment on column public.profiles.birth_date is
  'Date of birth; set once. Age is calculated in the client.';

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

drop policy if exists "body_weight_select_own" on public.body_weight_entries;
create policy "body_weight_select_own"
  on public.body_weight_entries for select
  using (auth.uid() = user_id);

drop policy if exists "body_weight_insert_own" on public.body_weight_entries;
create policy "body_weight_insert_own"
  on public.body_weight_entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "body_weight_update_own" on public.body_weight_entries;
create policy "body_weight_update_own"
  on public.body_weight_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "body_weight_delete_own" on public.body_weight_entries;
create policy "body_weight_delete_own"
  on public.body_weight_entries for delete
  using (auth.uid() = user_id);
