-- FitTrack AI — schema del database (PostgreSQL / Neon)
-- Idempotente: si può eseguire più volte (npm run db:migrate).
-- La protezione dei dati tra utenti è applicata dal server: ogni query filtra per user_id
-- dell'utente autenticato (vedi src/lib/server/actions.ts).

-- ---------------------------------------------------------------------------
-- Autenticazione (tabelle richieste da Better Auth)
-- ---------------------------------------------------------------------------
create table if not exists "user" (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null,
  "image" text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null
);

create table if not exists "session" (
  "id" text not null primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade
);

create table if not exists "account" (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null
);

create table if not exists "verification" (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null
);

create index if not exists "session_userId_idx" on "session" ("userId");
create index if not exists "account_userId_idx" on "account" ("userId");
create index if not exists "verification_identifier_idx" on "verification" ("identifier");

-- ---------------------------------------------------------------------------
-- Tipi
-- ---------------------------------------------------------------------------
do $$ begin
  create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');
exception when duplicate_object then null; end $$;

do $$ begin
  create type food_source as enum ('ai', 'search', 'manual');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Profili
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id text primary key references "user" ("id") on delete cascade,
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
  protein_goal_g int check (protein_goal_g between 0 and 1000),
  carbs_goal_g int check (carbs_goal_g between 0 and 2000),
  fat_goal_g int check (fat_goal_g between 0 and 1000),
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
create table if not exists food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user" ("id") on delete cascade,
  entry_date date not null,
  meal_type meal_type not null,
  name text not null check (char_length(name) between 1 and 200),
  grams numeric(7,1) not null check (grams > 0 and grams <= 5000),
  calories numeric(7,1) not null check (calories >= 0 and calories <= 20000),
  protein_g numeric(6,1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(6,1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(6,1) not null default 0 check (fat_g >= 0),
  source food_source not null default 'manual',
  created_at timestamptz not null default now()
);
create index if not exists food_entries_user_date_idx on food_entries (user_id, entry_date);

-- ---------------------------------------------------------------------------
-- Acqua
-- ---------------------------------------------------------------------------
create table if not exists water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user" ("id") on delete cascade,
  log_date date not null,
  amount_ml int not null check (amount_ml > 0 and amount_ml <= 3000),
  logged_at timestamptz not null default now()
);
create index if not exists water_logs_user_date_idx on water_logs (user_id, log_date);

-- ---------------------------------------------------------------------------
-- Allenamenti
-- ---------------------------------------------------------------------------
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user" ("id") on delete cascade,
  workout_date date not null,
  activity text not null check (char_length(activity) <= 40),
  duration_min int not null check (duration_min > 0 and duration_min <= 1440),
  intensity text not null check (intensity in ('light', 'moderate', 'vigorous')),
  distance_km numeric(6,2) check (distance_km is null or (distance_km > 0 and distance_km <= 500)),
  body_weight_kg numeric(5,1) not null check (body_weight_kg between 30 and 350),
  met numeric(4,1) not null check (met > 0 and met < 30),
  calories_burned int not null check (calories_burned >= 0 and calories_burned <= 20000),
  notes text check (notes is null or char_length(notes) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists workouts_user_date_idx on workouts (user_id, workout_date);

-- ---------------------------------------------------------------------------
-- Peso corporeo (una misurazione al giorno)
-- ---------------------------------------------------------------------------
create table if not exists weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user" ("id") on delete cascade,
  log_date date not null,
  weight_kg numeric(5,1) not null check (weight_kg between 30 and 350),
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);
