import { ACTIVITY_LEVELS } from "./constants";
import type { ActivityLevel, Goal, Sex } from "./types";

export interface BodyData {
  age: number;
  sex: Sex | null;
  height_cm: number;
  weight_kg: number;
  target_weight_kg: number | null;
  activity_level: ActivityLevel;
  goal: Goal;
}

export interface Targets {
  bmr: number;
  tdee: number;
  calorie_goal: number;
  protein_goal_g: number;
  carbs_goal_g: number;
  fat_goal_g: number;
  water_goal_ml: number;
}

/**
 * Metabolismo basale con l'equazione di Mifflin-St Jeor.
 * Se il sesso non è indicato si usa la media delle due costanti (+5 / -161).
 */
export function calcBMR({ age, sex, height_cm, weight_kg }: Pick<BodyData, "age" | "sex" | "height_cm" | "weight_kg">) {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  const s = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  return Math.round(base + s);
}

export function calcTargets(d: BodyData): Targets {
  const bmr = calcBMR(d);
  const factor = ACTIVITY_LEVELS.find((a) => a.id === d.activity_level)?.factor ?? 1.2;
  const tdee = Math.round(bmr * factor);

  const minCalories = d.sex === "male" ? 1500 : 1200;
  let calorie_goal = tdee;
  if (d.goal === "lose") calorie_goal = Math.max(minCalories, tdee - 500);
  if (d.goal === "gain") calorie_goal = tdee + 300;
  calorie_goal = Math.round(calorie_goal / 10) * 10;

  // Proteine in g/kg: più alte in deficit per preservare la massa magra.
  // In dimagrimento si usa il peso obiettivo (se inferiore) per non sovrastimare.
  const refWeight =
    d.goal === "lose" && d.target_weight_kg && d.target_weight_kg < d.weight_kg ? d.target_weight_kg : d.weight_kg;
  const proteinPerKg = d.goal === "lose" ? 2.0 : d.goal === "gain" ? 1.8 : 1.6;
  const protein_goal_g = Math.round(refWeight * proteinPerKg);
  const fat_goal_g = Math.round((calorie_goal * 0.28) / 9);
  const carbs_goal_g = Math.max(50, Math.round((calorie_goal - protein_goal_g * 4 - fat_goal_g * 9) / 4));
  const water_goal_ml = Math.min(4000, Math.max(1500, Math.round((d.weight_kg * 35) / 50) * 50));

  return { bmr, tdee, calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g, water_goal_ml };
}

export function bmi(weight_kg: number, height_cm: number) {
  const m = height_cm / 100;
  return weight_kg / (m * m);
}

export function bmiLabel(v: number) {
  if (v < 18.5) return "Sottopeso";
  if (v < 25) return "Normopeso";
  if (v < 30) return "Sovrappeso";
  return "Obesità";
}

/** Scala i valori per 100 g su una quantità in grammi. */
export function scaleNutrients(per100: { calories: number; protein: number; carbs: number; fat: number }, grams: number) {
  const k = grams / 100;
  return {
    calories: round1(per100.calories * k),
    protein_g: round1(per100.protein * k),
    carbs_g: round1(per100.carbs * k),
    fat_g: round1(per100.fat * k),
  };
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function sumBy<T>(rows: T[], f: (r: T) => number) {
  return rows.reduce((acc, r) => acc + (Number(f(r)) || 0), 0);
}
