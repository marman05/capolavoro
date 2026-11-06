export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type FoodSource = "ai" | "search" | "manual";
export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";
export type Intensity = "light" | "moderate" | "vigorous";

export interface Profile {
  id: string;
  display_name: string | null;
  age: number | null;
  sex: Sex | null;
  height_cm: number | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  bmr: number | null;
  tdee: number | null;
  calorie_goal: number | null;
  protein_goal_g: number | null;
  carbs_goal_g: number | null;
  fat_goal_g: number | null;
  water_goal_ml: number;
  reminders_enabled: boolean;
  water_reminder_minutes: number;
  onboarded: boolean;
}

export interface FoodEntry {
  id: string;
  entry_date: string;
  meal_type: MealType;
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: FoodSource;
  created_at: string;
}

export interface WaterLog {
  id: string;
  log_date: string;
  amount_ml: number;
  logged_at: string;
}

export interface Workout {
  id: string;
  workout_date: string;
  activity: string;
  duration_min: number;
  intensity: Intensity;
  distance_km: number | null;
  body_weight_kg: number;
  met: number;
  calories_burned: number;
  notes: string | null;
  created_at: string;
}

export interface WeightLog {
  id: string;
  log_date: string;
  weight_kg: number;
}

/** Valori nutrizionali per 100 g, usati dalla ricerca alimenti. */
export interface FoodSearchResult {
  id: string;
  name: string;
  brand?: string;
  source: "local" | "usda" | "openfoodfacts";
  per100: { calories: number; protein: number; carbs: number; fat: number };
  servingGrams?: number;
}

/** Alimento riconosciuto dall'AI nella foto. */
export interface AnalyzedFood {
  name: string;
  grams: number;
  confidence: number;
  needs_confirmation: boolean;
  alternatives: string[];
  note: string;
  per100: { calories: number; protein: number; carbs: number; fat: number };
}

export interface FoodAnalysis {
  is_food: boolean;
  dish_description: string;
  items: AnalyzedFood[];
  question_for_user: string;
}
