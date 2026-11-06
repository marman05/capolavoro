"use client";

import { createClient } from "./supabase/client";
import type { FoodEntry, FoodSource, Intensity, MealType, Profile, WaterLog, WeightLog, Workout } from "./types";

const sb = () => createClient();

function num<T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T {
  const out = { ...row };
  for (const k of keys) if (out[k] !== null && out[k] !== undefined) (out[k] as unknown) = Number(out[k]);
  return out;
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ---------- Profilo ----------
export async function getProfile(): Promise<Profile | null> {
  const { data: u } = await sb().auth.getUser();
  if (!u.user) return null;
  const res = await sb().from("profiles").select("*").eq("id", u.user.id).maybeSingle();
  let row = check(res) as Profile | null;
  if (!row) {
    // Il trigger di registrazione dovrebbe averlo creato; in caso contrario lo creiamo ora.
    row = check(await sb().from("profiles").insert({ id: u.user.id }).select("*").single()) as Profile;
  }
  return num(row as unknown as Record<string, unknown>, ["height_cm", "weight_kg", "target_weight_kg"]) as unknown as Profile;
}

export async function updateProfile(id: string, patch: Partial<Profile>) {
  const { id: _omit, ...rest } = patch;
  void _omit;
  return check(await sb().from("profiles").update(rest).eq("id", id).select("*").single()) as Profile;
}

// ---------- Alimenti ----------
const FOOD_NUM: (keyof FoodEntry)[] = ["grams", "calories", "protein_g", "carbs_g", "fat_g"];

export async function getFoodEntries(from: string, to: string = from): Promise<FoodEntry[]> {
  const rows = check(
    await sb()
      .from("food_entries")
      .select("*")
      .gte("entry_date", from)
      .lte("entry_date", to)
      .order("created_at", { ascending: true }),
  ) as FoodEntry[];
  return rows.map((r) => num(r as unknown as Record<string, unknown>, FOOD_NUM as string[]) as unknown as FoodEntry);
}

export interface NewFood {
  entry_date: string;
  meal_type: MealType;
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: FoodSource;
}

export async function addFoodEntries(items: NewFood[]) {
  if (!items.length) return [];
  return check(await sb().from("food_entries").insert(items).select("*")) as FoodEntry[];
}

export async function updateFoodEntry(id: string, patch: Partial<NewFood>) {
  return check(await sb().from("food_entries").update(patch).eq("id", id).select("*").single()) as FoodEntry;
}

export async function deleteFoodEntry(id: string) {
  check(await sb().from("food_entries").delete().eq("id", id));
}

/** Alimenti registrati di recente (deduplicati per nome) per l'aggiunta rapida. */
export async function getRecentFoods(limit = 12): Promise<FoodEntry[]> {
  const rows = check(
    await sb().from("food_entries").select("*").order("created_at", { ascending: false }).limit(80),
  ) as FoodEntry[];
  const seen = new Set<string>();
  const out: FoodEntry[] = [];
  for (const r of rows) {
    const k = r.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(num(r as unknown as Record<string, unknown>, FOOD_NUM as string[]) as unknown as FoodEntry);
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- Acqua ----------
export async function getWaterLogs(from: string, to: string = from): Promise<WaterLog[]> {
  return check(
    await sb().from("water_logs").select("*").gte("log_date", from).lte("log_date", to).order("logged_at", { ascending: true }),
  ) as WaterLog[];
}

export async function addWater(log_date: string, amount_ml: number) {
  return check(await sb().from("water_logs").insert({ log_date, amount_ml }).select("*").single()) as WaterLog;
}

export async function deleteWater(id: string) {
  check(await sb().from("water_logs").delete().eq("id", id));
}

// ---------- Allenamenti ----------
const WORKOUT_NUM: (keyof Workout)[] = ["distance_km", "body_weight_kg", "met"];

export async function getWorkouts(from: string, to: string = from): Promise<Workout[]> {
  const rows = check(
    await sb()
      .from("workouts")
      .select("*")
      .gte("workout_date", from)
      .lte("workout_date", to)
      .order("workout_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ) as Workout[];
  return rows.map((r) => num(r as unknown as Record<string, unknown>, WORKOUT_NUM as string[]) as unknown as Workout);
}

export interface NewWorkout {
  workout_date: string;
  activity: string;
  duration_min: number;
  intensity: Intensity;
  distance_km: number | null;
  body_weight_kg: number;
  met: number;
  calories_burned: number;
  notes: string | null;
}

export async function addWorkout(w: NewWorkout) {
  return check(await sb().from("workouts").insert(w).select("*").single()) as Workout;
}

export async function deleteWorkout(id: string) {
  check(await sb().from("workouts").delete().eq("id", id));
}

// ---------- Peso ----------
export async function getWeightLogs(from: string, to: string): Promise<WeightLog[]> {
  const rows = check(
    await sb().from("weight_logs").select("*").gte("log_date", from).lte("log_date", to).order("log_date", { ascending: true }),
  ) as WeightLog[];
  return rows.map((r) => ({ ...r, weight_kg: Number(r.weight_kg) }));
}

export async function upsertWeight(log_date: string, weight_kg: number) {
  return check(
    await sb().from("weight_logs").upsert({ log_date, weight_kg }, { onConflict: "user_id,log_date" }).select("*").single(),
  ) as WeightLog;
}

export async function deleteWeight(id: string) {
  check(await sb().from("weight_logs").delete().eq("id", id));
}
