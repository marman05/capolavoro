"use client";

import { useEffect } from "react";
import { getFoodEntries, getWaterLogs } from "@/lib/data";
import { toISODate } from "@/lib/date";
import { MEAL_LABEL } from "@/lib/constants";
import { notify } from "@/lib/notify";
import type { MealType } from "@/lib/types";
import { useProfile } from "./profile-provider";

const MEAL_CHECKPOINTS: { meal: MealType; hour: number; minute: number }[] = [
  { meal: "breakfast", hour: 10, minute: 30 },
  { meal: "lunch", hour: 14, minute: 30 },
  { meal: "dinner", hour: 21, minute: 30 },
];

function store(key: string, value?: string) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    // storage non disponibile
  }
  return null;
}

/** Promemoria per bere acqua e registrare i pasti mentre l'app è aperta. */
export function Reminders() {
  const { profile } = useProfile();

  useEffect(() => {
    if (!profile.reminders_enabled) return;
    let cancelled = false;

    async function tick() {
      const now = new Date();
      const today = toISODate(now);
      const h = now.getHours();
      if (h < 8 || h >= 23) return;

      // --- Acqua ---
      try {
        const intervalMs = profile.water_reminder_minutes * 60_000;
        const lastReminder = Number(store("ft:lastWaterReminder") ?? 0);
        if (now.getTime() - lastReminder > intervalMs) {
          const logs = await getWaterLogs(today);
          if (cancelled) return;
          const total = logs.reduce((a, l) => a + l.amount_ml, 0);
          const last = logs.length ? new Date(logs[logs.length - 1].logged_at).getTime() : 0;
          if (total < profile.water_goal_ml && now.getTime() - last > intervalMs) {
            store("ft:lastWaterReminder", String(now.getTime()));
            const left = profile.water_goal_ml - total;
            notify("💧 È ora di bere", `Ti mancano ${left} ml per raggiungere l'obiettivo di oggi.`, {
              label: "Aggiungi",
              href: "/acqua",
            });
          }
        }
      } catch {
        // rete assente: riprova al prossimo ciclo
      }

      // --- Pasti ---
      try {
        const due = MEAL_CHECKPOINTS.filter(
          (c) => h > c.hour || (h === c.hour && now.getMinutes() >= c.minute),
        ).filter((c) => store(`ft:mealReminder:${today}:${c.meal}`) !== "1");
        if (!due.length) return;
        const entries = await getFoodEntries(today);
        if (cancelled) return;
        const pending = due.filter((c) => !entries.some((e) => e.meal_type === c.meal));
        due.forEach((c) => store(`ft:mealReminder:${today}:${c.meal}`, "1"));
        const last = pending[pending.length - 1];
        if (last) {
          notify(`🍽️ Hai registrato ${MEAL_LABEL[last.meal].toLowerCase()}?`, "Aggiungi il pasto al diario, anche con una foto.", {
            label: "Registra",
            href: "/scansiona",
          });
        }
      } catch {
        // ignora
      }
    }

    const first = setTimeout(tick, 15_000);
    const id = setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [profile.reminders_enabled, profile.water_reminder_minutes, profile.water_goal_ml]);

  return null;
}
