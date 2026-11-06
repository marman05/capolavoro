-- FitTrack AI — schema iniziale
-- Ogni tabella è protetta da Row Level Security: un utente può leggere e
-- modificare SOLO le proprie righe (auth.uid() = user_id).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tipi
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.food_source as enum ('ai', 'search', 'manual');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Profili
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  age int check (age between 13 and 110),
  sex text check (sex in ('male', 'female')),
  height_cm numeric(5,1) check (height_cm between 100 and 250),
  weight_kg numeric(5,1) check (weight_kg between 30 and 350),
  target_weight_kg numeric(5,1) check (target_weight_kg between 30 and 350),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal text check (goal in ('lose', 'maintain', 'gain')),
  bmr int,
  tdee int,
  calorie_goal int check (calorie_goal between 800 and 6000),
  protein_goal_g int,
  carbs_goal_g int,
  fat_goal_g int,
  water_goal_ml int not null default 2000 check (water_goal_ml between 500 and 8000),
  reminders_enabled boolean not null default true,
  water_reminder_minutes int not null default 90 check (water_reminder_minutes between 15 and 480),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Diario alimentare
-- ---------------------------------------------------------------------------
create table if not exists public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_date date not null,
  meal_type public.meal_type not null,
  name text not null check (char_length(name) between 1 and 200),
  grams numeric(7,1) not null check (grams > 0 and grams <= 5000),
  calories numeric(7,1) not null check (calories >= 0),
  protein_g numeric(6,1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(6,1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(6,1) not null default 0 check (fat_g >= 0),
  source public.food_source not null default 'manual',
  created_at timestamptz not null default now()
);
create index if not exists food_entries_user_date_idx on public.food_entries (user_id, entry_date);

-- ---------------------------------------------------------------------------
-- Acqua
-- ---------------------------------------------------------------------------
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  amount_ml int not null check (amount_ml > 0 and amount_ml <= 3000),
  logged_at timestamptz not null default now()
);
create index if not exists water_logs_user_date_idx on public.water_logs (user_id, log_date);

-- ---------------------------------------------------------------------------
-- Allenamenti
-- ---------------------------------------------------------------------------
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_date date not null,
  activity text not null,
  duration_min int not null check (duration_min > 0 and duration_min <= 1440),
  intensity text not null check (intensity in ('light', 'moderate', 'vigorous')),
  distance_km numeric(6,2) check (distance_km is null or (distance_km > 0 and distance_km <= 500)),
  body_weight_kg numeric(5,1) not null check (body_weight_kg between 30 and 350),
  met numeric(4,1) not null,
  calories_burned int not null check (calories_burned >= 0),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists workouts_user_date_idx on public.workouts (user_id, workout_date);

-- ---------------------------------------------------------------------------
-- Peso corporeo (una misurazione al giorno)
-- ---------------------------------------------------------------------------
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5,1) not null check (weight_kg between 30 and 350),
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.food_entries enable row level security;
alter table public.water_logs enable row level security;
alter table public.workouts enable row level security;
alter table public.weight_logs enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

do $$
declare t text;
begin
  foreach t in array array['food_entries', 'water_logs', 'workouts', 'weight_logs'] loop
    execute format('drop policy if exists "%1$s_owner_all" on public.%1$I', t);
    execute format(
      'create policy "%1$s_owner_all" on public.%1$I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Trigger: crea il profilo alla registrazione e aggiorna updated_at
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Realtime: la dashboard si aggiorna appena cambia un dato (RLS rispettata)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['food_entries', 'water_logs', 'workouts', 'weight_logs', 'profiles'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
             when undefined_object then null;
    end;
  end loop;
end $$;
