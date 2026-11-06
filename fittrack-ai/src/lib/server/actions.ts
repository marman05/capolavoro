"use server";

import { z } from "zod";
import { query } from "./db";
import { requireUserId } from "./session";
import type { FoodEntry, Profile, WaterLog, WeightLog, Workout } from "@/lib/types";

// Ogni funzione è un endpoint pubblico (Server Action): verifica sempre la sessione,
// valida gli input e filtra le query per user_id. Nessun utente può leggere o
// modificare dati di un altro.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().uuid();
const meal = z.enum(["breakfast", "lunch", "dinner", "snack"]);
const nn = (max: number) => z.number().finite().min(0).max(max);

// ---------- Profilo ----------
const PROFILE_COLS = `id, display_name, age, sex, height_cm, weight_kg, target_weight_kg, activity_level, goal, bmr, tdee,
  calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g, water_goal_ml, reminders_enabled, water_reminder_minutes, onboarded`;

export async function getProfile(): Promise<Profile | null> {
  const userId = await requireUserId().catch(() => null);
  if (!userId) return null;
  const rows = await query<Profile>(
    `insert into profiles (id, display_name)
       select u.id, nullif(u.name, '') from "user" u where u.id = $1
     on conflict (id) do update set id = excluded.id
     returning ${PROFILE_COLS}`,
    [userId],
  );
  return rows[0] ?? null;
}

const ProfilePatch = z
  .object({
    display_name: z.string().trim().max(40).nullable(),
    age: z.number().int().min(13).max(110).nullable(),
    sex: z.enum(["male", "female"]).nullable(),
    height_cm: z.number().min(100).max(250).nullable(),
    weight_kg: z.number().min(30).max(350).nullable(),
    target_weight_kg: z.number().min(30).max(350).nullable(),
    activity_level: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).nullable(),
    goal: z.enum(["lose", "maintain", "gain"]).nullable(),
    bmr: z.number().int().min(0).max(10000).nullable(),
    tdee: z.number().int().min(0).max(15000).nullable(),
    calorie_goal: z.number().int().min(800).max(6000).nullable(),
    protein_goal_g: z.number().int().min(0).max(1000).nullable(),
    carbs_goal_g: z.number().int().min(0).max(2000).nullable(),
    fat_goal_g: z.number().int().min(0).max(1000).nullable(),
    water_goal_ml: z.number().int().min(500).max(8000),
    reminders_enabled: z.boolean(),
    water_reminder_minutes: z.number().int().min(15).max(480),
    onboarded: z.boolean(),
  })
  .partial()
  .strict();

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  const userId = await requireUserId();
  const { id: _ignored, ...rest } = patch;
  void _ignored;
  const data = ProfilePatch.parse(rest);
  const keys = Object.keys(data) as (keyof typeof data)[];
  if (!keys.length) return (await getProfile())!;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const rows = await query<Profile>(
    `update profiles set ${sets}, updated_at = now() where id = $1 returning ${PROFILE_COLS}`,
    [userId, ...keys.map((k) => data[k])],
  );
  return rows[0];
}

// ---------- Alimenti ----------
const FOOD_COLS = "id, entry_date, meal_type, name, grams, calories, protein_g, carbs_g, fat_g, source, created_at";

export async function getFoodEntries(from: string, to: string = from): Promise<FoodEntry[]> {
  const userId = await requireUserId();
  return query<FoodEntry>(
    `select ${FOOD_COLS} from food_entries where user_id = $1 and entry_date between $2 and $3 order by created_at`,
    [userId, isoDate.parse(from), isoDate.parse(to)],
  );
}

const NewFood = z.object({
  entry_date: isoDate,
  meal_type: meal,
  name: z.string().trim().min(1).max(200),
  grams: z.number().positive().max(5000),
  calories: nn(20000),
  protein_g: nn(5000),
  carbs_g: nn(5000),
  fat_g: nn(5000),
  source: z.enum(["ai", "search", "manual"]),
});
export type NewFood = z.infer<typeof NewFood>;

const r1 = (n: number) => Math.round(n * 10) / 10;

export async function addFoodEntries(items: NewFood[]): Promise<FoodEntry[]> {
  const userId = await requireUserId();
  const list = z.array(NewFood).min(1).max(30).parse(items);
  const out: FoodEntry[] = [];
  for (const f of list) {
    const rows = await query<FoodEntry>(
      `insert into food_entries (user_id, entry_date, meal_type, name, grams, calories, protein_g, carbs_g, fat_g, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning ${FOOD_COLS}`,
      [userId, f.entry_date, f.meal_type, f.name, r1(f.grams), r1(f.calories), r1(f.protein_g), r1(f.carbs_g), r1(f.fat_g), f.source],
    );
    out.push(rows[0]);
  }
  return out;
}

const FoodPatch = NewFood.pick({ meal_type: true, grams: true, calories: true, protein_g: true, carbs_g: true, fat_g: true }).partial().strict();

export async function updateFoodEntry(entryId: string, patch: Partial<NewFood>): Promise<FoodEntry> {
  const userId = await requireUserId();
  const data = FoodPatch.parse(patch);
  const keys = Object.keys(data) as (keyof typeof data)[];
  const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");
  const rows = await query<FoodEntry>(
    `update food_entries set ${sets} where id = $1 and user_id = $2 returning ${FOOD_COLS}`,
    [id.parse(entryId), userId, ...keys.map((k) => (typeof data[k] === "number" ? r1(data[k] as number) : data[k]))],
  );
  if (!rows[0]) throw new Error("Alimento non trovato");
  return rows[0];
}

export async function deleteFoodEntry(entryId: string) {
  const userId = await requireUserId();
  await query("delete from food_entries where id = $1 and user_id = $2", [id.parse(entryId), userId]);
}

export async function getRecentFoods(limit = 12): Promise<FoodEntry[]> {
  const userId = await requireUserId();
  return query<FoodEntry>(
    `select * from (
       select distinct on (lower(name)) ${FOOD_COLS} from food_entries
       where user_id = $1 order by lower(name), created_at desc
     ) t order by created_at desc limit $2`,
    [userId, z.number().int().min(1).max(50).parse(limit)],
  );
}

// ---------- Acqua ----------
export async function getWaterLogs(from: string, to: string = from): Promise<WaterLog[]> {
  const userId = await requireUserId();
  return query<WaterLog>(
    `select id, log_date, amount_ml, logged_at from water_logs where user_id = $1 and log_date between $2 and $3 order by logged_at`,
    [userId, isoDate.parse(from), isoDate.parse(to)],
  );
}

export async function addWater(logDate: string, amountMl: number): Promise<WaterLog> {
  const userId = await requireUserId();
  const rows = await query<WaterLog>(
    `insert into water_logs (user_id, log_date, amount_ml) values ($1,$2,$3) returning id, log_date, amount_ml, logged_at`,
    [userId, isoDate.parse(logDate), z.number().int().min(1).max(3000).parse(amountMl)],
  );
  return rows[0];
}

export async function deleteWater(logId: string) {
  const userId = await requireUserId();
  await query("delete from water_logs where id = $1 and user_id = $2", [id.parse(logId), userId]);
}

// ---------- Allenamenti ----------
const WORKOUT_COLS =
  "id, workout_date, activity, duration_min, intensity, distance_km, body_weight_kg, met, calories_burned, notes, created_at";

export async function getWorkouts(from: string, to: string = from): Promise<Workout[]> {
  const userId = await requireUserId();
  return query<Workout>(
    `select ${WORKOUT_COLS} from workouts where user_id = $1 and workout_date between $2 and $3
     order by workout_date desc, created_at desc`,
    [userId, isoDate.parse(from), isoDate.parse(to)],
  );
}

const NewWorkout = z.object({
  workout_date: isoDate,
  activity: z.string().min(1).max(40),
  duration_min: z.number().int().min(1).max(1440),
  intensity: z.enum(["light", "moderate", "vigorous"]),
  distance_km: z.number().positive().max(500).nullable(),
  body_weight_kg: z.number().min(30).max(350),
  met: z.number().positive().max(29.9),
  calories_burned: z.number().int().min(0).max(20000),
  notes: z.string().trim().max(200).nullable(),
});
export type NewWorkout = z.infer<typeof NewWorkout>;

export async function addWorkout(w: NewWorkout): Promise<Workout> {
  const userId = await requireUserId();
  const d = NewWorkout.parse(w);
  const rows = await query<Workout>(
    `insert into workouts (user_id, workout_date, activity, duration_min, intensity, distance_km, body_weight_kg, met, calories_burned, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning ${WORKOUT_COLS}`,
    [userId, d.workout_date, d.activity, d.duration_min, d.intensity, d.distance_km, d.body_weight_kg, d.met, d.calories_burned, d.notes],
  );
  return rows[0];
}

export async function deleteWorkout(workoutId: string) {
  const userId = await requireUserId();
  await query("delete from workouts where id = $1 and user_id = $2", [id.parse(workoutId), userId]);
}

// ---------- Peso ----------
export async function getWeightLogs(from: string, to: string): Promise<WeightLog[]> {
  const userId = await requireUserId();
  return query<WeightLog>(
    `select id, log_date, weight_kg from weight_logs where user_id = $1 and log_date between $2 and $3 order by log_date`,
    [userId, isoDate.parse(from), isoDate.parse(to)],
  );
}

export async function upsertWeight(logDate: string, weightKg: number): Promise<WeightLog> {
  const userId = await requireUserId();
  const rows = await query<WeightLog>(
    `insert into weight_logs (user_id, log_date, weight_kg) values ($1,$2,$3)
     on conflict (user_id, log_date) do update set weight_kg = excluded.weight_kg
     returning id, log_date, weight_kg`,
    [userId, isoDate.parse(logDate), z.number().min(30).max(350).parse(Math.round(weightKg * 10) / 10)],
  );
  return rows[0];
}

export async function deleteWeight(logId: string) {
  const userId = await requireUserId();
  await query("delete from weight_logs where id = $1 and user_id = $2", [id.parse(logId), userId]);
}
