"use client";

import { useCallback, useEffect, useState } from "react";
import { getFoodEntries, getWaterLogs, getWorkouts } from "@/lib/data";
import type { FoodEntry, WaterLog, Workout } from "@/lib/types";
import { useRealtime } from "./use-realtime";

export interface DayData {
  foods: FoodEntry[];
  water: WaterLog[];
  workouts: Workout[];
}

/** Carica cibo, acqua e allenamenti di un giorno e resta sincronizzato in tempo reale. */
export function useDayData(date: string) {
  const [state, setState] = useState<(DayData & { date: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [foods, water, workouts] = await Promise.all([getFoodEntries(date), getWaterLogs(date), getWorkouts(date)]);
      setState({ date, foods, water, workouts });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore di caricamento");
    }
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- caricamento dati asincrono dal server
    reload();
  }, [reload]);

  useRealtime(["food_entries", "water_logs", "workouts"], reload);

  // Mostra i dati solo se appartengono al giorno richiesto (evita flash del giorno precedente).
  const data: DayData | null = state && state.date === date ? state : null;
  return { data, error, reload };
}
