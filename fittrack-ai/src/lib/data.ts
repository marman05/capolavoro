"use client";

// Accesso ai dati dal browser: chiama le Server Action (che verificano la sessione)
// e, dopo ogni modifica, avvisa le pagine aperte di ricaricare i dati.
import * as actions from "./server/actions";
import type { NewFood, NewWorkout } from "./server/actions";
import type { Profile } from "./types";

export type { NewFood, NewWorkout };

export const DATA_CHANGED = "ft:data-changed";

function changed(table: string) {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED, { detail: { table } }));
  try {
    // Sincronizza anche le altre schede aperte.
    localStorage.setItem(DATA_CHANGED, `${table}:${Date.now()}`);
  } catch {
    // storage non disponibile
  }
}

function mutation<A extends unknown[], R>(table: string, fn: (...a: A) => Promise<R>) {
  return async (...a: A) => {
    const r = await fn(...a);
    changed(table);
    return r;
  };
}

export const getProfile = actions.getProfile;
export const updateProfile = async (_id: string, patch: Partial<Profile>) => {
  const r = await actions.updateProfile(patch);
  changed("profiles");
  return r;
};

export const getFoodEntries = actions.getFoodEntries;
export const getRecentFoods = actions.getRecentFoods;
export const addFoodEntries = mutation("food_entries", actions.addFoodEntries);
export const updateFoodEntry = mutation("food_entries", actions.updateFoodEntry);
export const deleteFoodEntry = mutation("food_entries", actions.deleteFoodEntry);

export const getWaterLogs = actions.getWaterLogs;
export const addWater = mutation("water_logs", actions.addWater);
export const deleteWater = mutation("water_logs", actions.deleteWater);

export const getWorkouts = actions.getWorkouts;
export const addWorkout = mutation("workouts", actions.addWorkout);
export const deleteWorkout = mutation("workouts", actions.deleteWorkout);

export const getWeightLogs = actions.getWeightLogs;
export const upsertWeight = mutation("weight_logs", actions.upsertWeight);
export const deleteWeight = mutation("weight_logs", actions.deleteWeight);
