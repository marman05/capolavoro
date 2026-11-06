import type { ActivityLevel, Goal, MealType } from "./types";

export const MEALS: { id: MealType; label: string; emoji: string }[] = [
  { id: "breakfast", label: "Colazione", emoji: "☕" },
  { id: "lunch", label: "Pranzo", emoji: "🥗" },
  { id: "dinner", label: "Cena", emoji: "🍝" },
  { id: "snack", label: "Spuntini", emoji: "🍎" },
];

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "Colazione",
  lunch: "Pranzo",
  dinner: "Cena",
  snack: "Spuntini",
};

/** Pasto suggerito in base all'ora corrente. */
export function mealForNow(d = new Date()): MealType {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 15) return "lunch";
  if (h >= 18 && h < 23) return "dinner";
  return "snack";
}

export const ACTIVITY_LEVELS: { id: ActivityLevel; label: string; description: string; factor: number }[] = [
  { id: "sedentary", label: "Sedentario", description: "Lavoro d'ufficio, pochi passi al giorno", factor: 1.2 },
  { id: "light", label: "Leggero", description: "In piedi spesso o 1-3 allenamenti a settimana", factor: 1.375 },
  { id: "moderate", label: "Moderato", description: "Molto in movimento o 3-5 allenamenti a settimana", factor: 1.55 },
  { id: "active", label: "Attivo", description: "Lavoro fisico o 6-7 allenamenti a settimana", factor: 1.725 },
  { id: "very_active", label: "Molto attivo", description: "Lavoro pesante e allenamenti quotidiani intensi", factor: 1.9 },
];

export const GOALS: { id: Goal; label: string; description: string }[] = [
  { id: "lose", label: "Dimagrire", description: "Deficit di circa 500 kcal al giorno (~0,5 kg/settimana)" },
  { id: "maintain", label: "Mantenere il peso", description: "Calorie pari al fabbisogno stimato" },
  { id: "gain", label: "Aumentare massa muscolare", description: "Surplus moderato di circa 300 kcal al giorno" },
];

export const WATER_QUICK_ADD = [150, 250, 500] as const;
